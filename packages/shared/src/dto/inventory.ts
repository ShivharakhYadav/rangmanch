import { SeatStatus } from '../enums';

/** One seat as rendered on the seat map. `status` merges Postgres truth with Redis locks. */
export interface SeatMapSeatDto {
  seatRef: string;
  rowLabel: string;
  seatNumber: number;
  posX: number;
  posY: number;
  category: { id: string; name: string; color: string | null };
  price: number; // paise
  status: SeatStatus; // AVAILABLE | LOCKED | BOOKED | BLOCKED
}

export interface SeatMapDto {
  showId: string;
  startsAt: string;
  event: { id: string; title: string; slug: string };
  hall: { id: string; name: string; venue: { id: string; name: string; city: string } };
  seats: SeatMapSeatDto[];
  holdTtlSeconds: number;
}

/** Returned when a hold is created — the client uses holdToken to release/confirm. */
export interface HoldResultDto {
  holdToken: string;
  showId: string;
  seatRefs: string[];
  expiresAt: string; // ISO 8601
  ttlSeconds: number;
}

/** Real-time seat update pushed over WebSocket. */
export interface SeatUpdateEvent {
  showId: string;
  seatRefs: string[];
  status: SeatStatus; // LOCKED | AVAILABLE | BOOKED
}
