import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminOrderDto,
  AdminShowDto,
  OccupancyDto,
  OrderStatus,
  SalesReportDto,
} from '@ticketing/shared';
import { SeatStatus, redisKeys } from '@ticketing/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SeatEventsGateway } from '../inventory/seat-events.gateway';
import type { AuthUser } from '../../common/types/auth-user';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: SeatEventsGateway,
  ) {}

  // ---------- Offline seat blocking ----------

  async blockSeats(actor: AuthUser, showId: string, seatRefs: string[]): Promise<{ blocked: number }> {
    const ids = await this.seatIdsFor(showId, seatRefs);
    const res = await this.prisma.showSeat.updateMany({
      where: { id: { in: ids }, status: 'AVAILABLE' },
      data: { status: 'BLOCKED' },
    });
    await this.audit(actor, 'block_seats', showId, { seatRefs, blocked: res.count });
    if (res.count > 0) this.gateway.broadcast(showId, seatRefs, SeatStatus.Blocked);
    return { blocked: res.count };
  }

  async unblockSeats(actor: AuthUser, showId: string, seatRefs: string[]): Promise<{ unblocked: number }> {
    const ids = await this.seatIdsFor(showId, seatRefs);
    const res = await this.prisma.showSeat.updateMany({
      where: { id: { in: ids }, status: 'BLOCKED' },
      data: { status: 'AVAILABLE' },
    });
    await this.audit(actor, 'unblock_seats', showId, { seatRefs, unblocked: res.count });
    if (res.count > 0) this.gateway.broadcast(showId, seatRefs, SeatStatus.Available);
    return { unblocked: res.count };
  }

  // ---------- Cancellation + (mock) refund ----------

  async cancelOrder(actor: AuthUser, orderId: string): Promise<{ status: OrderStatus }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { seats: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      return { status: order.status as OrderStatus };
    }

    const showSeatIds = order.seats.map((s) => s.showSeatId);
    const seatRefs = order.seats.map((s) => s.seatRef);

    if (order.status === 'CONFIRMED') {
      await this.prisma.$transaction([
        this.prisma.showSeat.updateMany({
          where: { id: { in: showSeatIds }, status: 'BOOKED' },
          data: { status: 'AVAILABLE', version: { increment: 1 } },
        }),
        this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } }),
        this.prisma.payment.update({ where: { orderId }, data: { status: 'REFUNDED' } }),
        this.prisma.outboxEvent.create({
          data: {
            aggregate: 'order',
            aggregateId: orderId,
            type: 'BookingCancelled',
            payload: { orderId, reason: 'admin_cancel_refund' },
          },
        }),
      ]);
    } else {
      // PENDING — release the transient hold too.
      await this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
      const holderKey = redisKeys.holderLocks(order.holdToken);
      const seatKeys = seatRefs.map((r) => redisKeys.seatLock(order.showId, r));
      await this.redis.releaseSeats(holderKey, seatKeys, order.holdToken);
    }

    this.gateway.broadcast(order.showId, seatRefs, SeatStatus.Available);
    await this.audit(actor, 'cancel_order', orderId, { seatRefs, previousStatus: order.status });
    return { status: 'CANCELLED' as OrderStatus };
  }

  // ---------- Reports ----------

  async salesReport(from?: string, to?: string): Promise<SalesReportDto> {
    const dateFilter = this.dateRange(from, to);
    const confirmedWhere: Prisma.OrderWhereInput = { status: 'CONFIRMED', ...dateFilter };

    const [agg, seatsSold, grouped] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { amount: true }, _count: true, where: confirmedWhere }),
      this.prisma.orderSeat.count({ where: { order: confirmedWhere } }),
      this.prisma.order.groupBy({ by: ['status'], _count: true, where: dateFilter }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count;

    return {
      revenue: agg._sum.amount ?? 0,
      confirmedOrders: agg._count,
      seatsSold,
      byStatus,
    };
  }

  async occupancy(showId: string): Promise<OccupancyDto> {
    const grouped = await this.prisma.showSeat.groupBy({
      by: ['status'],
      _count: true,
      where: { showId },
    });
    const counts: Record<string, number> = { AVAILABLE: 0, BOOKED: 0, BLOCKED: 0 };
    for (const g of grouped) counts[g.status] = g._count;
    const total = counts.AVAILABLE + counts.BOOKED + counts.BLOCKED;
    return {
      showId,
      total,
      booked: counts.BOOKED,
      blocked: counts.BLOCKED,
      available: counts.AVAILABLE,
      occupancyPct: total ? Math.round((counts.BOOKED / total) * 100) : 0,
    };
  }

  async listShows(): Promise<AdminShowDto[]> {
    const shows = await this.prisma.show.findMany({
      include: { event: { select: { title: true } }, hall: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return Promise.all(
      shows.map(async (s) => ({
        showId: s.id,
        eventTitle: s.event.title,
        startsAt: s.startsAt.toISOString(),
        hallName: s.hall.name,
        occupancy: await this.occupancy(s.id),
      })),
    );
  }

  async listOrders(showId?: string, status?: string): Promise<AdminOrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...(showId ? { showId } : {}),
        ...(status ? { status: status as OrderStatus } : {}),
      },
      include: { user: true, seats: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status as OrderStatus,
      amount: o.amount,
      referenceNo: o.referenceNo,
      userPhone: o.user.phone,
      userName: o.user.name,
      seatRefs: o.seats.map((s) => s.seatRef),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  // ---------- Helpers ----------

  private async seatIdsFor(showId: string, seatRefs: string[]): Promise<string[]> {
    const rows = await this.prisma.showSeat.findMany({
      where: { showId, seat: { seatRef: { in: seatRefs } } },
      select: { id: true },
    });
    if (rows.length !== seatRefs.length) {
      throw new NotFoundException('One or more seats do not exist for this show');
    }
    return rows.map((r) => r.id);
  }

  private dateRange(from?: string, to?: string): Prisma.OrderWhereInput {
    if (!from && !to) return {};
    return {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
  }

  private async audit(
    actor: AuthUser,
    action: string,
    target: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId: actor.userId, actorPhone: actor.phone, action, target, metadata },
    });
  }
}
