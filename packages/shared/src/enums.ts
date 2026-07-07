/** Lifecycle state of a single seat for a given show. */
export enum SeatStatus {
  Available = 'AVAILABLE',
  Locked = 'LOCKED', // temporary hold (Redis TTL), in someone's cart
  Reserved = 'RESERVED', // payment initiated
  Booked = 'BOOKED', // confirmed, source-of-truth in Postgres
  Blocked = 'BLOCKED', // pre-blocked by admin for offline sales
}

/** Category used to bucket events on listing pages. Derived from show times. */
export enum EventStatus {
  Past = 'PAST',
  Ongoing = 'ONGOING',
  Upcoming = 'UPCOMING',
}

/** Booking / order lifecycle. */
export enum BookingStatus {
  Pending = 'PENDING',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
  Refunded = 'REFUNDED',
}

/** Order lifecycle through the payment saga. */
export enum OrderStatus {
  Pending = 'PENDING',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
}

/** WhatsApp ticket delivery state. */
export enum TicketDeliveryStatus {
  Pending = 'PENDING',
  Sent = 'SENT',
  Failed = 'FAILED',
}

/** Payment lifecycle (mirrors saga steps). */
export enum PaymentStatus {
  Created = 'CREATED',
  Authorized = 'AUTHORIZED',
  Captured = 'CAPTURED',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
}

/** Admin roles for RBAC. */
export enum UserRole {
  Customer = 'CUSTOMER',
  Support = 'SUPPORT',
  VenueManager = 'VENUE_MANAGER',
  SuperAdmin = 'SUPER_ADMIN',
}
