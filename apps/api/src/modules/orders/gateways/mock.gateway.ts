import type { GatewayOrder, PaymentGateway, WebhookResult } from './payment-gateway';

/**
 * Dev gateway — no external calls, no keys. Payment outcomes are driven via the
 * `POST /orders/:id/mock-pay` endpoint rather than a signed webhook.
 */
export class MockGateway implements PaymentGateway {
  readonly provider = 'mock';

  createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
  }): Promise<GatewayOrder> {
    return Promise.resolve({
      gatewayOrderId: `mock_order_${input.receipt}`,
      amount: input.amount,
      currency: input.currency,
      mock: true,
    });
  }

  parseWebhook(): WebhookResult | null {
    return null; // not used in mock mode
  }
}
