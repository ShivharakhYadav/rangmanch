import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HoldResultDto } from '@ticketing/shared';
import { MAX_SEATS_PER_LOCK, redisKeys } from '@ticketing/shared';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface ReleaseResult {
  released: number;
  seatRefs: string[];
}

export interface ConfirmResult {
  showId: string;
  seatRefs: string[];
  status: 'BOOKED';
}

@Injectable()
export class SeatLockService {
  private readonly ttl: number;
  private readonly maxSeats = MAX_SEATS_PER_LOCK;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('SEAT_HOLD_TTL_SECONDS') ?? 60;
  }

  /**
   * Atomically hold seats for a (possibly new) holder token. Locks in Redis
   * first — the atomic guard against concurrent holders — then verifies the
   * seats are actually AVAILABLE in Postgres, releasing if not.
   */
  async createHold(
    showId: string,
    seatRefs: string[],
    holdToken?: string,
  ): Promise<HoldResultDto> {
    const token = holdToken ?? randomUUID();
    const holderKey = redisKeys.holderLocks(token);
    const seatKeys = seatRefs.map((r) => redisKeys.seatLock(showId, r));

    const result = await this.redis.lockSeats(holderKey, seatKeys, token, this.ttl, this.maxSeats);
    if (result === -1) {
      this.metrics.seatHolds.inc({ result: 'conflict' });
      throw new ConflictException('One or more seats were just taken by someone else');
    }
    if (result === -2) {
      this.metrics.seatHolds.inc({ result: 'limit' });
      throw new ForbiddenException(`Seat hold limit exceeded (max ${this.maxSeats} per session)`);
    }

    // Verify against the source of truth; roll back the lock if anything is off.
    const showSeats = await this.prisma.showSeat.findMany({
      where: { showId, seat: { seatRef: { in: seatRefs } } },
      select: { status: true },
    });
    const allAvailable =
      showSeats.length === seatRefs.length && showSeats.every((s) => s.status === 'AVAILABLE');
    if (!allAvailable) {
      await this.redis.releaseSeats(holderKey, seatKeys, token);
      this.metrics.seatHolds.inc({ result: 'conflict' });
      if (showSeats.length !== seatRefs.length) {
        throw new NotFoundException('One or more seats do not exist for this show');
      }
      throw new ConflictException('One or more seats are already booked or blocked');
    }

    this.metrics.seatHolds.inc({ result: 'acquired' });
    return {
      holdToken: token,
      showId,
      seatRefs,
      expiresAt: new Date(Date.now() + this.ttl * 1000).toISOString(),
      ttlSeconds: this.ttl,
    };
  }

  /** Release specific seats, or the entire hold if no seatRefs given. */
  async release(showId: string, holdToken: string, seatRefs?: string[]): Promise<ReleaseResult> {
    const holderKey = redisKeys.holderLocks(holdToken);
    const keys =
      seatRefs && seatRefs.length
        ? seatRefs.map((r) => redisKeys.seatLock(showId, r))
        : await this.redis.redis.smembers(holderKey);

    const released = await this.redis.releaseSeats(holderKey, keys, holdToken);
    return { released, seatRefs: keys.map((k) => this.seatRefFromKey(k)) };
  }

  /**
   * Confirm a hold into a BOOKED state (Phase 2 stand-in for payment).
   * The conditional updateMany (status = AVAILABLE) inside a transaction is the
   * final, race-proof guard against double-booking.
   */
  async confirm(showId: string, holdToken: string, seatRefs: string[]): Promise<ConfirmResult> {
    const holderKey = redisKeys.holderLocks(holdToken);
    const seatKeys = seatRefs.map((r) => redisKeys.seatLock(showId, r));

    // Ownership: every seat lock must currently belong to this holder.
    const owners = await this.redis.redis.mget(seatKeys);
    if (!owners.every((v) => v === holdToken)) {
      throw new ConflictException('Your hold has expired or is invalid — please reselect seats');
    }

    const targets = await this.prisma.showSeat.findMany({
      where: { showId, seat: { seatRef: { in: seatRefs } } },
      select: { id: true },
    });
    if (targets.length !== seatRefs.length) {
      throw new NotFoundException('One or more seats do not exist for this show');
    }
    const ids = targets.map((t) => t.id);

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.showSeat.updateMany({
        where: { id: { in: ids }, status: 'AVAILABLE' },
        data: { status: 'BOOKED', version: { increment: 1 } },
      });
      if (res.count !== ids.length) {
        // At least one seat was no longer AVAILABLE — abort the whole booking.
        throw new ConflictException('One or more seats were just booked by someone else');
      }
    });

    // Seats are now BOOKED; drop the transient Redis locks.
    await this.redis.releaseSeats(holderKey, seatKeys, holdToken);
    return { showId, seatRefs, status: 'BOOKED' };
  }

  private seatRefFromKey(key: string): string {
    // seat:lock:{showId}:{seatRef}
    return key.split(':').slice(3).join(':');
  }
}
