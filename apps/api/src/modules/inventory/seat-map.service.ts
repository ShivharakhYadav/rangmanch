import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SeatMapDto, SeatMapSeatDto } from '@ticketing/shared';
import { SeatStatus, redisKeys } from '@ticketing/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class SeatMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async getSeatMap(showId: string): Promise<SeatMapDto> {
    const show = await this.prisma.show.findUnique({
      where: { id: showId },
      include: {
        event: { select: { id: true, title: true, slug: true } },
        hall: { include: { venue: true } },
        showSeats: { include: { seat: { include: { category: true } } } },
      },
    });
    if (!show) throw new NotFoundException(`Show "${showId}" not found`);

    // Which seats are currently held (Redis locks)?
    const seatRefs = show.showSeats.map((ss) => ss.seat.seatRef);
    const lockedSet = new Set<string>();
    if (seatRefs.length) {
      const lockKeys = seatRefs.map((r) => redisKeys.seatLock(showId, r));
      const values = await this.redis.redis.mget(lockKeys);
      values.forEach((v, i) => {
        if (v) lockedSet.add(seatRefs[i]!);
      });
    }

    const seats: SeatMapSeatDto[] = show.showSeats
      .map((ss) => {
        let status: SeatStatus;
        if (ss.status === 'BOOKED') status = SeatStatus.Booked;
        else if (ss.status === 'BLOCKED') status = SeatStatus.Blocked;
        else if (lockedSet.has(ss.seat.seatRef)) status = SeatStatus.Locked;
        else status = SeatStatus.Available;

        return {
          seatRef: ss.seat.seatRef,
          rowLabel: ss.seat.rowLabel,
          seatNumber: ss.seat.seatNumber,
          posX: ss.seat.posX,
          posY: ss.seat.posY,
          category: {
            id: ss.seat.category.id,
            name: ss.seat.category.name,
            color: ss.seat.category.color,
          },
          price: ss.price,
          status,
        };
      })
      .sort((a, b) => a.posY - b.posY || a.posX - b.posX);

    return {
      showId: show.id,
      startsAt: show.startsAt.toISOString(),
      event: show.event,
      hall: {
        id: show.hall.id,
        name: show.hall.name,
        venue: { id: show.hall.venue.id, name: show.hall.venue.name, city: show.hall.venue.city },
      },
      seats,
      holdTtlSeconds: this.config.get<number>('SEAT_HOLD_TTL_SECONDS') ?? 60,
    };
  }
}
