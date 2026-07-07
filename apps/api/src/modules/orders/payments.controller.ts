import { Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from './orders.service';

/** Public payment-provider webhooks. Signature is verified inside the gateway. */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly orders: OrdersService) {}

  @Post('razorpay/webhook')
  @HttpCode(200)
  async razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    await this.orders.handleWebhook(req.rawBody ?? '', signature);
    return { received: true };
  }
}
