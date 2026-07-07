import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { SeatUpdateEvent } from '@ticketing/shared';
import { SeatStatus } from '@ticketing/shared';
import { RedisService, type SeatExpiredEvent } from '../../redis/redis.service';

/**
 * Pushes live seat updates to everyone viewing a show. Clients emit `subscribe`
 * with a showId to join that show's room. Auto-release (Redis TTL expiry) is
 * bridged from RedisService so abandoned holds free up on screens in real time.
 *
 * Scaling note: for multi-instance, add @socket.io/redis-adapter so HTTP-triggered
 * broadcasts fan out across instances. Expiry events already fan out because every
 * instance subscribes to Redis keyspace notifications.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SeatEventsGateway implements OnModuleInit {
  private readonly logger = new Logger(SeatEventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.redis.on('seat-expired', (e: SeatExpiredEvent) => {
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
