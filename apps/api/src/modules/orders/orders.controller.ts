import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { CreateOrderResultDto, OrderStatus, OrderSummaryDto } from '@ticketing/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { MockPayDto } from './dto/mock-pay.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto): Promise<CreateOrderResultDto> {
    return this.orders.createOrder(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<OrderSummaryDto[]> {
    return this.orders.getUserOrders(user.userId);
  }

  @Post(':id/mock-pay')
  mockPay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MockPayDto,
  ): Promise<{ status: OrderStatus }> {
    return this.orders.mockPay(user.userId, id, dto.outcome);
  }
}
