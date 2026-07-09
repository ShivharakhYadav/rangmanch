import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import type { SeatUpdateEvent } from '@ticketing/shared';
import { SeatStatus } from '@ticketing/shared';
import { MetricsService } from '../../observability/metrics.service';
import { RedisService, type SeatExpiredEvent } from '../../redis/redis.service';

/**
 * Pushes live seat updates to everyone viewing a show. Clients emit `subscribe`
 * with a showId to join that show's room. Auto-release (Redis TTL expiry) is
 * bridged from RedisService so abandoned holds free up on screens in real time.
 *
 * Multi-instance: a @socket.io/redis-adapter (dedicated pub/sub clients) fans out
 * HTTP-triggered broadcasts across every API instance. Expiry events also fan out
 * because every instance subscribes to Redis keyspace notifications.
 */
@SkipThrottle() // rate-limiting the WS gateway with the HTTP throttler is invalid
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SeatEventsGateway implements OnGatewayInit, OnModuleInit {
  private readonly logger = new Logger(SeatEventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  // Attach the Redis adapter so broadcasts reach clients on other instances.
  afterInit(server: Server): void {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const pub = new Redis(url, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    server.adapter(createAdapter(pub, sub));
    this.logger.log('socket.io Redis adapter attached (multi-instance broadcasts)');
  }

  onModuleInit(): void {
    this.redis.on('seat-expired', (e: SeatExpiredEvent) => {
      this.metrics.seatExpiries.inc();
      this.broadcast(e.showId, [e.seatRef], SeatStatus.Available);
    });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { showId?: string },
    @ConnectedSocket() client: Socket,
  ): { ok: boolean } {
    if (data?.showId) {
      void client.join(this.room(data.showId));
    }
    return { ok: Boolean(data?.showId) };
  }

  /** Broadcast a seat status change to all clients watching this show. */
  broadcast(showId: string, seatRefs: string[], status: SeatStatus): void {
    if (!this.server || seatRefs.length === 0) return;
    const payload: SeatUpdateEvent = { showId, seatRefs, status };
    this.server.to(this.room(showId)).emit('seat:update', payload);
  }

  private room(showId: string): string {
    return `show:${showId}`;
  }
}
