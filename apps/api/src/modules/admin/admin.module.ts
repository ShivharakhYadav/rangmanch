import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [InventoryModule], // SeatEventsGateway for live broadcasts on block/cancel
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
