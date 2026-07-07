import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { HoldResultDto, SeatMapDto } from '@ticketing/shared';
import { SeatStatus } from '@ticketing/shared';
import { SeatMapService } from './seat-map.service';
import { SeatLockService, type ConfirmResult, type ReleaseResult } from './seat-lock.service';
import { SeatEventsGateway } from './seat-events.gateway';
import { CreateHoldDto } from './dto/create-hold.dto';
import { ReleaseHoldDto } from './dto/release-hold.dto';
import { ConfirmHoldDto } from './dto/confirm-hold.dto';

@Controller('shows')
export class InventoryController {
  constructor(
    private readonly seatMap: SeatMapService,
    private readonly locks: SeatLockService,
    private readonly gateway: SeatEventsGateway,
  ) {}

  @Get(':showId/seatmap')
  getSeatMap(@Param('showId') showId: string): Promise<SeatMapDto> {
    return this.seatMap.getSeatMap(showId);
  }

  @Post(':showId/holds')
  async createHold(
    @Param('showId') showId: string,
    @Body() dto: CreateHoldDto,
  ): Promise<HoldResultDto> {
    const result = await this.locks.createHold(showId, dto.seatRefs, dto.holdToken);
    this.gateway.broadcast(showId, dto.seatRefs, SeatStatus.Locked);
    return result;
  }

  @Post(':showId/holds/release')
  async releaseHold(
    @Param('showId') showId: string,
    @Body() dto: ReleaseHoldDto,
  ): Promise<ReleaseResult> {
    const result = await this.locks.release(showId, dto.holdToken, dto.seatRefs);
    if (result.seatRefs.length) {
      this.gateway.broadcast(showId, result.seatRefs, SeatStatus.Available);
    }
    return result;
  }

  @Post(':showId/confirm')
  async confirm(
    @Param('showId') showId: string,
    @Body() dto: ConfirmHoldDto,
  ): Promise<ConfirmResult> {
    const result = await this.locks.confirm(showId, dto.holdToken, dto.seatRefs);
    this.gateway.broadcast(showId, dto.seatRefs, SeatStatus.Booked);
    return result;
  }
}
