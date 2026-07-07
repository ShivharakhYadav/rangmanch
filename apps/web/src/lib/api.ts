import type {
  AuthTokensDto,
  CreateOrderResultDto,
  EventDetailDto,
  EventStatus,
  EventSummaryDto,
  HealthResponse,
  HoldResultDto,
  OrderStatus,
  OrderSummaryDto,
  OtpRequestResultDto,
  PaginatedDto,
  SeatMapDto,
  VenueDto,
} from '@ticketing/shared';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:6002';
const API_V1 = `${API_BASE_URL}/api/v1`;

/** Parse an error body from the API into a readable message. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Fetch API liveness. Returns null if the API is unreachable. */
export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** List events, optionally filtered by status/city. */
export async function fetchEvents(params?: {
  status?: EventStatus;
  city?: string;
}): Promise<PaginatedDto<EventSummaryDto>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.city) qs.set('city', params.city);
  const res = await fetch(`${API_V1}/events?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  return (await res.json()) as PaginatedDto<EventSummaryDto>;
}

/** Fetch a single event by slug. Returns null on 404. */
export async function fetchEventBySlug(slug: string): Promise<EventDetailDto | null> {
  const res = await fetch(`${API_V1}/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load event (${res.status})`);
  return (await res.json()) as EventDetailDto;
}

export async function fetchVenues(): Promise<VenueDto[]> {
  const res = await fetch(`${API_V1}/venues`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load venues (${res.status})`);
  return (await res.json()) as VenueDto[];
}

// ---------- Inventory / booking ----------

export async function fetchSeatMap(showId: string): Promise<SeatMapDto> {
  const res = await fetch(`${API_V1}/shows/${showId}/seatmap`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to load seat map (${res.status})`));
  return (await res.json()) as SeatMapDto;
}

export async function createHold(
  showId: string,
  seatRefs: string[],
  holdToken?: string,
): Promise<HoldResultDto> {
  const res = await fetch(`${API_V1}/shows/${showId}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatRefs, holdToken }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not hold seats'));
  return (await res.json()) as HoldResultDto;
}

export async function releaseHold(
  showId: string,
  holdToken: string,
  seatRefs?: string[],
): Promise<void> {
  await fetch(`${API_V1}/shows/${showId}/holds/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdToken, seatRefs }),
    keepalive: true,
  });
}

export async function confirmHold(
  showId: string,
  holdToken: string,
  seatRefs: string[],
): Promise<void> {
  const res = await fetch(`${API_V1}/shows/${showId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdToken, seatRefs }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not confirm booking'));
}

// ---------- Auth ----------

export async function requestOtp(phone: string): Promise<OtpRequestResultDto> {
  const res = await fetch(`${API_V1}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send OTP'));
  return (await res.json()) as OtpRequestResultDto;
}

export async function verifyOtp(
  phone: string,
  code: string,
  name?: string,
): Promise<AuthTokensDto> {
  const res = await fetch(`${API_V1}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, name }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Invalid or expired code'));
  return (await res.json()) as AuthTokensDto;
}

// ---------- Orders ----------

export async function createOrder(
  token: string,
  body: { showId: string; holdToken: string; seatRefs: string[]; idempotencyKey: string },
): Promise<CreateOrderResultDto> {
  const res = await fetch(`${API_V1}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not create order'));
  return (await res.json()) as CreateOrderResultDto;
}

export async function mockPay(
  token: string,
  orderId: string,
  outcome: 'success' | 'fail',
): Promise<{ status: OrderStatus }> {
  const res = await fetch(`${API_V1}/orders/${orderId}/mock-pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ outcome }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Payment failed'));
  return (await res.json()) as { status: OrderStatus };
}

export async function fetchMyOrders(token: string): Promise<OrderSummaryDto[]> {
  const res = await fetch(`${API_V1}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load bookings'));
  return (await res.json()) as OrderSummaryDto[];
}
