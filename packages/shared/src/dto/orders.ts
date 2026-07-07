import { OrderStatus, TicketDeliveryStatus } from '../enums';

/** Returned when an order (and its payment intent) is created. */
export interface CreateOrderResultDto {
  orderId: string;
  status: OrderStatus;
  amount: number; // paise
  expiresAt: string; // ISO — payment window
  payment: {
    provider: string; // 'mock' | 'razorpay'
    gatewayOrderId: string;
    amount: number; // paise
    currency: string; // 'INR'
    keyId?: string; // Razorpay public key (real gateway checkout)
    mock?: boolean; // true when the dev mock gateway is active
  };
}

/** Order as shown in booking history. */
export interface OrderSummaryDto {
  id: string;
  status: OrderStatus;
  amount: number; // paise
  referenceNo: string | null;
  showId: string;
  eventTitle: string;
  startsAt: string;
  seatRefs: string[];
  createdAt: string;
  ticketStatus: TicketDeliveryStatus | null;
  ticketUrl: string | null; // signed download link, present once a ticket exists
}
