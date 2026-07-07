import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import type { GatewayOrder, PaymentGateway, WebhookResult } from './payment-gateway';

/**
 * Real Razorpay gateway. Activated when PAYMENT_PROVIDER=razorpay and keys are set.
 * Webhook signature is verified with HMAC-SHA256 over the raw request body.
 */
export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'razorpay';
  private readonly logger = new Logger(RazorpayGateway.name);
  private readonly client: Razorpay;

  constructor(
    private readonly keyId: string,
    keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
  }): Promise<GatewayOrder> {
    const order = await this.client.orders.create({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
    });
    return {
      gatewayOrderId: order.id,
      amount: input.amount,
      currency: input.currency,
      keyId: this.keyId,
    };
  }

  parseWebhook(rawBody: Buffer | string, signature: string | undefined): WebhookResult | null {
    if (!signature || !this.webhookSecret) return null;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Rejected webhook with invalid signature');
      return null;
    }

    const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const evt = JSON.parse(raw) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    const payment = evt.payload?.payment?.entity;
    const outcome =
      evt.event === 'payment.captured'
        ? 'captured'
        : evt.event === 'payment.failed'
          ? 'failed'
          : null;
    if (!outcome || !payment?.order_id) return null;

    return {
      eventId: `${payment.id ?? payment.order_id}:${evt.event}`,
      gatewayOrderId: payment.order_id,
      gatewayPaymentId: payment.id,
      outcome,
    };
  }
}
