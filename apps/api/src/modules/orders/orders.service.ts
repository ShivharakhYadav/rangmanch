import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Order, type Payment } from '@prisma/client';
import type { CreateOrderResultDto, OrderStatus, OrderSummaryDto } from '@ticketing/shared';
import { SeatStatus, redisKeys } from '@ticketing/shared';
import type { TicketDeliveryStatus } from '@ticketing/shared';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SeatEventsGateway } from '../inventory/seat-events.gateway';
import { TicketService } from '../notifications/ticket.service';
import { PAYMENT_GATEWAY, type GatewayOrder, type PaymentGateway } from './gateways/payment-gateway';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly paymentWindow: number;
  private readonly currency: string;
  private readonly keyId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: SeatEventsGateway,
    private readonly config: ConfigService,
    private readonly tickets: TicketService,
    private readonly metrics: MetricsService,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
  ) {
    this.paymentWindow = config.get<number>('PAYMENT_WINDOW_SECONDS') ?? 120;
    this.currency = config.get<string>('PAYMENT_CURRENCY') ?? 'INR';
    this.keyId = config.get<string>('RAZORPAY_KEY_ID');
  }

  // ---------- Create order (reserve + payment intent) ----------

  async createOrder(userId: string, dto: CreateOrderDto): Promise<CreateOrderResultDto> {
    // Idempotency: return the existing order for a repeated key.
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { payment: true },
    });
    if (existing?.payment) return this.toCreateResult(existing, existing.payment);

    const holderKey = redisKeys.holderLocks(dto.holdToken);
    const seatKeys = dto.seatRefs.map((r) => redisKeys.seatLock(dto.showId, r));

    // The caller must actually hold these seats.
    const owners = await this.redis.redis.mget(seatKeys);
    if (!owners.every((v) => v === dto.holdToken)) {
      throw new ConflictException('Your hold has expired — please reselect seats');
    }

    const showSeats = await this.prisma.showSeat.findMany({
      where: { showId: dto.showId, seat: { seatRef: { in: dto.seatRefs } } },
      include: { seat: { select: { seatRef: true } } },
    });
    if (showSeats.length !== dto.seatRefs.length) {
      throw new NotFoundException('One or more seats do not exist for this show');
    }
    if (showSeats.some((s) => s.status !== 'AVAILABLE')) {
      throw new ConflictException('One or more seats are already booked or blocked');
    }
    const amount = showSeats.reduce((sum, s) => sum + s.price, 0);

    // Keep the seats reserved through the payment window.
    await this.redis.extendHold(holderKey, seatKeys, this.paymentWindow);

    let order: Order;
    try {
      order = await this.prisma.order.create({
        data: {
          userId,
          showId: dto.showId,
          amount,
          holdToken: dto.holdToken,
          idempotencyKey: dto.idempotencyKey,
          expiresAt: new Date(Date.now() + this.paymentWindow * 1000),
          seats: {
            create: showSeats.map((ss) => ({
              showSeatId: ss.id,
              seatRef: ss.seat.seatRef,
              price: ss.price,
            })),
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('One or more seats are already part of another order');
      }
      throw e;
    }

    const gwOrder = await this.payments.createOrder({
      amount,
      currency: this.currency,
      receipt: order.id,
    });
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: this.payments.provider,
        gatewayOrderId: gwOrder.gatewayOrderId,
        amount,
      },
    });

    return this.toCreateResult(order, payment, gwOrder);
  }

  // ---------- Payment settlement (saga core) ----------

  /** Dev-only mock payment trigger. */
  async mockPay(userId: string, orderId: string, outcome: 'success' | 'fail'): Promise<{ status: OrderStatus }> {
    if (this.payments.provider !== 'mock') {
      throw new BadRequestException('Mock payments are disabled (real gateway active)');
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new NotFoundException('Order not found');
    const status = await this.settle(orderId, outcome === 'success' ? 'captured' : 'failed', `mock_pay_${orderId}`);
    return { status };
  }

  /** Razorpay webhook entry point (raw body + signature). */
  async handleWebhook(rawBody: Buffer | string, signature: string | undefined): Promise<void> {
    const result = this.payments.parseWebhook(rawBody, signature);
    if (!result) return; // invalid signature or irrelevant event — ack silently

    // Idempotent dedup.
    try {
      await this.prisma.processedWebhook.create({ data: { id: result.eventId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // already handled
      throw e;
    }

    const payment = await this.prisma.payment.findFirst({
      where: { gatewayOrderId: result.gatewayOrderId },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown gateway order ${result.gatewayOrderId}`);
      return;
    }
    await this.settle(payment.orderId, result.outcome, result.gatewayPaymentId);
  }

  /**
   * The saga: on success, atomically flip seats AVAILABLE→BOOKED (final guard),
   * confirm the order, mint a reference + invoice, and emit an outbox event.
   * On failure — or if the seats were lost — compensate (cancel + release).
   */
  private async settle(
    orderId: string,
    outcome: 'captured' | 'failed',
    gatewayPaymentId?: string,
  ): Promise<OrderStatus> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { seats: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') return order.status as OrderStatus; // idempotent

    const showSeatIds = order.seats.map((s) => s.showSeatId);
    const seatRefs = order.seats.map((s) => s.seatRef);
    const holderKey = redisKeys.holderLocks(order.holdToken);
    const seatKeys = seatRefs.map((r) => redisKeys.seatLock(order.showId, r));

    if (outcome === 'failed') {
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } }),
        this.prisma.payment.update({
          where: { orderId },
          data: { status: 'FAILED', gatewayPaymentId },
        }),
        this.prisma.outboxEvent.create({
          data: {
            aggregate: 'order',
            aggregateId: orderId,
            type: 'BookingCancelled',
            payload: { orderId, reason: 'payment_failed' },
          },
        }),
      ]);
      await this.redis.releaseSeats(holderKey, seatKeys, order.holdToken);
      this.gateway.broadcast(order.showId, seatRefs, SeatStatus.Available);
      this.metrics.payments.inc({ outcome: 'failed' });
      this.metrics.bookings.inc({ status: 'cancelled' });
      return 'CANCELLED' as OrderStatus;
    }

    // outcome === 'captured'
    const referenceNo = this.generateReference();
    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.showSeat.updateMany({
          where: { id: { in: showSeatIds }, status: 'AVAILABLE' },
          data: { status: 'BOOKED', version: { increment: 1 } },
        });
        if (res.count !== showSeatIds.length) {
          throw new ConflictException('Seats no longer available');
        }
        await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED', referenceNo } });
        await tx.payment.update({
          where: { orderId },
          data: { status: 'CAPTURED', gatewayPaymentId },
        });
        await tx.invoice.create({ data: { orderId, referenceNo, amount: order.amount } });
        await tx.outboxEvent.create({
          data: {
            aggregate: 'order',
            aggregateId: orderId,
            type: 'BookingConfirmed',
            payload: { orderId, referenceNo, userId: order.userId, showId: order.showId, seatRefs },
          },
        });
      });
    } catch {
      // Seats were lost (hold expired + reclaimed). Compensate — in production this
      // triggers a refund of the captured payment.
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } }),
        this.prisma.payment.update({
          where: { orderId },
          data: { status: 'CAPTURED', gatewayPaymentId }, // captured but needs refund
        }),
        this.prisma.outboxEvent.create({
          data: {
            aggregate: 'order',
            aggregateId: orderId,
            type: 'BookingCancelled',
            payload: { orderId, reason: 'seats_unavailable_refund_due' },
          },
        }),
      ]);
      await this.redis.releaseSeats(holderKey, seatKeys, order.holdToken);
      this.gateway.broadcast(order.showId, seatRefs, SeatStatus.Available);
      this.metrics.payments.inc({ outcome: 'captured' });
      this.metrics.bookings.inc({ status: 'cancelled' });
      throw new ConflictException('Seats were no longer available; your payment will be refunded');
    }

    await this.redis.releaseSeats(holderKey, seatKeys, order.holdToken);
    this.gateway.broadcast(order.showId, seatRefs, SeatStatus.Booked);
    this.metrics.payments.inc({ outcome: 'captured' });
    this.metrics.bookings.inc({ status: 'confirmed' });
    return 'CONFIRMED' as OrderStatus;
  }

  // ---------- Reads ----------

  async getUserOrders(userId: string): Promise<OrderSummaryDto[]> {
    // Lazily expire stale pending orders (a cron would do this in production).
    await this.prisma.order.updateMany({
      where: { userId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });

    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        seats: true,
        ticket: true,
        show: { include: { event: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      id: o.id,
      status: o.status as OrderStatus,
      amount: o.amount,
      referenceNo: o.referenceNo,
      showId: o.showId,
      eventTitle: o.show.event.title,
      startsAt: o.show.startsAt.toISOString(),
      seatRefs: o.seats.map((s) => s.seatRef),
      createdAt: o.createdAt.toISOString(),
      ticketStatus: (o.ticket?.whatsappStatus as TicketDeliveryStatus | undefined) ?? null,
      ticketUrl: o.ticket ? this.tickets.signedUrl(o.id) : null,
    }));
  }

  // ---------- Helpers ----------

  private toCreateResult(order: Order, payment: Payment, gwOrder?: GatewayOrder): CreateOrderResultDto {
    return {
      orderId: order.id,
      status: order.status as OrderStatus,
      amount: order.amount,
      expiresAt: order.expiresAt.toISOString(),
      payment: {
        provider: payment.provider,
        gatewayOrderId: payment.gatewayOrderId,
        amount: payment.amount,
        currency: this.currency,
        keyId: gwOrder?.keyId ?? (payment.provider === 'razorpay' ? this.keyId : undefined),
        mock: gwOrder?.mock ?? payment.provider === 'mock',
      },
    };
  }

  private generateReference(): string {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `RM-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }
}
