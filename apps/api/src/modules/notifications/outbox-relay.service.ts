import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { OutboxEvent } from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketService } from './ticket.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp/whatsapp-provider';

interface BookingConfirmedPayload {
  orderId: string;
}

/**
 * In-process transactional-outbox relay. Polls unpublished events and dispatches
 * side effects (ticket generation + WhatsApp). Idempotent via `publishedAt`; a
 * failed event is left unpublished and retried on the next tick. In production
 * this is replaced by a Kafka consumer, but the outbox contract stays the same.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketService,
    private readonly metrics: MetricsService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  @Interval(5000)
  async poll(): Promise<void> {
    if (this.running) return; // avoid overlapping ticks
    this.running = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const event of events) {
        await this.handle(event);
      }
    } catch (err) {
      this.logger.error(`Relay poll failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async handle(event: OutboxEvent): Promise<void> {
    try {
      if (event.type === 'BookingConfirmed') {
        await this.deliverTicket((event.payload as unknown as BookingConfirmedPayload).orderId);
      }
      // BookingCancelled: nothing to deliver in MVP — just mark published.
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
    } catch (err) {
      // Leave unpublished so the next tick retries.
      this.logger.error(`Failed to process outbox event ${event.id} (${event.type}): ${String(err)}`);
    }
  }

  private async deliverTicket(orderId: string): Promise<void> {
    const { ticket, order } = await this.tickets.generate(orderId);
    const result = await this.whatsapp.sendTicket({
      to: ticket.whatsappTo ?? order.user.phone,
      eventTitle: order.show.event.title,
      startsAt: order.show.startsAt.toISOString(),
      seatRefs: order.seats.map((s) => s.seatRef),
      referenceNo: ticket.referenceNo,
      ticketUrl: this.tickets.signedUrl(orderId),
    });
    await this.tickets.markStatus(ticket.id, result.ok ? 'SENT' : 'FAILED');
    this.metrics.tickets.inc({ channel: this.whatsapp.provider, status: result.ok ? 'sent' : 'failed' });
    this.logger.log(
      `Ticket ${ticket.referenceNo} delivered via ${this.whatsapp.provider}: ${result.ok ? 'SENT' : 'FAILED'}`,
    );
  }
}
