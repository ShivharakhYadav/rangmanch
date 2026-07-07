import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { PaymentsController } from './payments.controller';
import { OrdersService } from './orders.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateways/payment-gateway';
import { MockGateway } from './gateways/mock.gateway';
import { RazorpayGateway } from './gateways/razorpay.gateway';

const paymentGatewayProvider = {
  provide: PAYMENT_GATEWAY,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PaymentGateway => {
    if (config.get<string>('PAYMENT_PROVIDER') === 'razorpay') {
      const keyId = config.get<string>('RAZORPAY_KEY_ID');
      const keySecret = config.get<string>('RAZORPAY_KEY_SECRET');
      const webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
      if (!keyId || !keySecret) {
        throw new Error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
      }
      return new RazorpayGateway(keyId, keySecret, webhookSecret);
    }
    return new MockGateway();
  },
};

@Module({
  imports: [InventoryModule], // provides SeatEventsGateway for live broadcasts
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService, paymentGatewayProvider],
})
export class OrdersModule {}
