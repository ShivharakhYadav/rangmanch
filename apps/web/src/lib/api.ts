import type {
  AdminOrderDto,
  AdminShowDto,
  AuthTokensDto,
  CreateOrderResultDto,
  EventDetailDto,
  EventStatus,
  EventSummaryDto,
  HealthResponse,
  HoldResultDto,
  OccupancyDto,
  OrderStatus,
  OrderSummaryDto,
  OtpRequestResultDto,
  PaginatedDto,
  SalesReportDto,
  SeatMapDto,
  VenueDto,
} from '@ticketing/shared';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:6002';
const API_V1 = `${API_BASE_URL}/api/v1`;

/**
 * A fetch-like function for authenticated calls. The auth context supplies one
 * that injects the access token and transparently refreshes / redirects on 401.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

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

/** Exchange a refresh token for a fresh token pair. */
export async function refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
  const res = await fetch(`${API_V1}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Session expired');
  return (await res.json()) as AuthTokensDto;
}

// ---------- Orders (authenticated via the injected fetcher) ----------

export async function createOrder(
  fetcher: Fetcher,
  body: { showId: string; holdToken: string; seatRefs: string[]; idempotencyKey: string },
): Promise<CreateOrderResultDto> {
  const res = await fetcher(`${API_V1}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not create order'));
  return (await res.json()) as CreateOrderResultDto;
}

export async function mockPay(
  fetcher: Fetcher,
  orderId: string,
  outcome: 'success' | 'fail',
): Promise<{ status: OrderStatus }> {
  const res = await fetcher(`${API_V1}/orders/${orderId}/mock-pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Payment failed'));
  return (await res.json()) as { status: OrderStatus };
}

export async function fetchMyOrders(fetcher: Fetcher): Promise<OrderSummaryDto[]> {
  const res = await fetcher(`${API_V1}/orders`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load bookings'));
  return (await res.json()) as OrderSummaryDto[];
}

// ---------- Admin (role-guarded via the injected fetcher) ----------

export async function fetchAdminShows(fetcher: Fetcher): Promise<AdminShowDto[]> {
  const res = await fetcher(`${API_V1}/admin/shows`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load shows'));
  return (await res.json()) as AdminShowDto[];
}

export async function fetchSalesReport(fetcher: Fetcher): Promise<SalesReportDto> {
  const res = await fetcher(`${API_V1}/admin/reports/sales`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load report'));
  return (await res.json()) as SalesReportDto;
}

export async function fetchOccupancy(fetcher: Fetcher, showId: string): Promise<OccupancyDto> {
  const res = await fetcher(`${API_V1}/admin/shows/${showId}/occupancy`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load occupancy'));
  return (await res.json()) as OccupancyDto;
}

export async function adminListOrders(fetcher: Fetcher, showId?: string): Promise<AdminOrderDto[]> {
  const qs = showId ? `?showId=${showId}` : '';
  const res = await fetcher(`${API_V1}/admin/orders${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load orders'));
  return (await res.json()) as AdminOrderDto[];
}

async function adminSeatAction(
  fetcher: Fetcher,
  showId: string,
  action: 'block' | 'unblock',
  seatRefs: string[],
): Promise<void> {
  const res = await fetcher(`${API_V1}/admin/shows/${showId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatRefs }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `Could not ${action} seats`));
}

export const adminBlockSeats = (f: Fetcher, showId: string, seatRefs: string[]) =>
  adminSeatAction(f, showId, 'block', seatRefs);
export const adminUnblockSeats = (f: Fetcher, showId: string, seatRefs: string[]) =>
  adminSeatAction(f, showId, 'unblock', seatRefs);

export async function adminCancelOrder(fetcher: Fetcher, orderId: string): Promise<void> {
  const res = await fetcher(`${API_V1}/admin/orders/${orderId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not cancel order'));
}
