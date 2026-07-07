import { EventEmitter } from 'node:events';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LOCK_SEATS_LUA, RELEASE_SEATS_LUA } from './lua-scripts';

export interface SeatExpiredEvent {
  showId: string;
  seatRef: string;
}

const LOCK_KEY_RE = /^seat:lock:([^:]+):(.+)$/;

/**
 * Wraps ioredis: a main client (commands + Lua) and a subscriber client that
 * listens for key-expiry events so the app can broadcast auto-releases.
 * Extends EventEmitter to publish `seat-expired` events to the WebSocket gateway.
 */
@Injectable()
export class RedisService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private subscriber!: Redis;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });

    this.registerScripts();

    // Enable expiry keyevent notifications, then subscribe to them.
    try {
      await this.client.config('SET', 'notify-keyspace-events', 'Ex');
    } catch (err) {
      this.logger.warn(`Could not set notify-keyspace-events: ${String(err)}`);
    }
    await this.subscriber.subscribe('__keyevent@0__:expired');
    this.subscriber.on('message', (_channel, expiredKey) => this.handleExpiry(expiredKey));

    this.logger.log('Redis connected (client + subscriber)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
    await this.subscriber?.quit();
  }

  /** Direct access for simple GET/MGET used by the seat-map read path. */
  get redis(): Redis {
    return this.client;
  }

  private registerScripts(): void {
    this.client.defineCommand('lockSeats', { lua: LOCK_SEATS_LUA });
    this.client.defineCommand('releaseSeats', { lua: RELEASE_SEATS_LUA });
  }

  /**
   * Attempt to lock the given seat keys for a holder.
   * @returns 1 acquired, -1 conflict (some seat taken), -2 limit exceeded.
   */
  async lockSeats(
    holderSetKey: string,
    seatKeys: string[],
    holderToken: string,
    ttlSeconds: number,
    maxSeats: number,
  ): Promise<number> {
    const keys = [holderSetKey, ...seatKeys];
    const result = await (
      this.client as unknown as {
        lockSeats: (numKeys: number, ...args: (string | number)[]) => Promise<number>;
      }
    ).lockSeats(keys.length, ...keys, holderToken, ttlSeconds, maxSeats);
    return Number(result);
  }

  /** Extend the TTL of a holder's seat locks (e.g. into a payment window). */
  async extendHold(holderSetKey: string, seatKeys: string[], ttlSeconds: number): Promise<void> {
    if (seatKeys.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const key of seatKeys) pipeline.expire(key, ttlSeconds);
    pipeline.expire(holderSetKey, ttlSeconds + 5);
    await pipeline.exec();
  }

  /** Release specific seats owned by the holder. Returns count released. */
  async releaseSeats(
    holderSetKey: string,
    seatKeys: string[],
    holderToken: string,
  ): Promise<number> {
    if (seatKeys.length === 0) return 0;
    const keys = [holderSetKey, ...seatKeys];
    const result = await (
      this.client as unknown as {
        releaseSeats: (numKeys: number, ...args: string[]) => Promise<number>;
      }
    ).releaseSeats(keys.length, ...keys, holderToken);
    return Number(result);
  }

  private handleExpiry(expiredKey: string): void {
    const match = LOCK_KEY_RE.exec(expiredKey);
    if (!match) return;
    const [, showId, seatRef] = match;
    this.emit('seat-expired', { showId, seatRef } as SeatExpiredEvent);
  }
}
