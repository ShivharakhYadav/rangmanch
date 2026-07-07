/** Payment gateway abstraction — a Mock impl for dev and a Razorpay impl for prod. */

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface GatewayOrder {
  gatewayOrderId: string;
  amount: number; // paise
  currency: string;
  keyId?: string; // public key for client checkout (Razorpay)
  mock?: boolean;
}

export interface WebhookResult {
  eventId: string; // for idempotent dedup
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  outcome: 'captured' | 'failed';
}

export interface PaymentGateway {
  readonly provider: string;
  createOrder(input: { amount: number; currency: string; receipt: string }): Promise<GatewayOrder>;
  /** Verify + parse a provider webhook. Returns null if signature is invalid or event is irrelevant. */
  parseWebhook(rawBody: Buffer | string, signature: string | undefined): WebhookResult | null;
}
