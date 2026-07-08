import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics registry + domain metrics. Injected into hot-path services
 * so business events (holds, bookings, payments, expiries, tickets) are counted.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration: Histogram<string>;
  readonly seatHolds: Counter<string>;
  readonly bookings: Counter<string>;
  readonly payments: Counter<string>;
  readonly seatExpiries: Counter<string>;
  readonly tickets: Counter<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'ticketing-api' });
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.seatHolds = new Counter({
      name: 'seat_hold_attempts_total',
      help: 'Seat hold attempts by result',
      labelNames: ['result'], // acquired | conflict | limit
      registers: [this.registry],
    });
    this.bookings = new Counter({
      name: 'bookings_total',
      help: 'Booking outcomes',
      labelNames: ['status'], // confirmed | cancelled
      registers: [this.registry],
    });
    this.payments = new Counter({
      name: 'payments_total',
      help: 'Payment outcomes',
      labelNames: ['outcome'], // captured | failed
      registers: [this.registry],
    });
    this.seatExpiries = new Counter({
      name: 'seat_hold_expiries_total',
      help: 'Seat holds auto-released via TTL expiry',
      registers: [this.registry],
    });
    this.tickets = new Counter({
      name: 'tickets_delivered_total',
      help: 'Ticket delivery attempts',
      labelNames: ['channel', 'status'], // e.g. mock|gupshup, sent|failed
      registers: [this.registry],
    });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
