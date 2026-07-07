import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  UserRole,
  type AdminOrderDto,
  type AdminShowDto,
  type OccupancyDto,
  type OrderStatus,
  type SalesReportDto,
} from '@ticketing/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AdminService } from './admin.service';
import { BlockSeatsDto } from './dto/block-seats.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VenueManager, UserRole.SuperAdmin)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('shows')
  listShows(): Promise<AdminShowDto[]> {
    return this.admin.listShows();
  }

  @Get('shows/:showId/occupancy')
  occupancy(@Param('showId') showId: string): Promise<OccupancyDto> {
    return this.admin.occupancy(showId);
  }

  @Post('shows/:showId/block')
  block(
    @CurrentUser() user: AuthUser,
    @Param('showId') showId: string,
    @Body() dto: BlockSeatsDto,
  ): Promise<{ blocked: number }> {
    return this.admin.blockSeats(user, showId, dto.seatRefs);
  }

  @Post('shows/:showId/unblock')
  unblock(
    @CurrentUser() user: AuthUser,
    @Param('showId') showId: string,
    @Body() dto: BlockSeatsDto,
  ): Promise<{ unblocked: number }> {
    return this.admin.unblockSeats(user, showId, dto.seatRefs);
  }

  @Get('orders')
  listOrders(
    @Query('showId') showId?: string,
    @Query('status') status?: string,
  ): Promise<AdminOrderDto[]> {
    return this.admin.listOrders(showId, status);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ status: OrderStatus }> {
    return this.admin.cancelOrder(user, id);
  }

  @Get('reports/sales')
  sales(@Query('from') from?: string, @Query('to') to?: string): Promise<SalesReportDto> {
    return this.admin.salesReport(from, to);
  }
}
