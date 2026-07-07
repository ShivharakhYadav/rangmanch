import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { SeatMapService } from './seat-map.service';
import { SeatLockService } from './seat-lock.service';
import { SeatEventsGateway } from './seat-events.gateway';

@Module({
  controllers: [InventoryController],
  providers: [SeatMapService, SeatLockService, SeatEventsGateway],
  exports: [SeatEventsGateway], // used by OrdersModule for live seat broadcasts
})
export class InventoryModule {}
