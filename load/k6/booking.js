/**
 * k6 throughput/latency test for the browse + seat-hold hot path.
 *
 * Ramps virtual users that repeatedly read the seat map and attempt a hold on a
 * random seat. 409 (seat already held) is an EXPECTED business response under
 * contention, so it is not counted as an HTTP failure.
 *
 * Run against an API with relaxed rate limiting:
 *   THROTTLE_LIMIT=1000000 node apps/api/dist/main.js
 *   k6 run load/k6/booking.js
 * Env: API_BASE_URL (default http://localhost:6002), SHOW_ID (auto-discovered).
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.API_BASE_URL || 'http://localhost:6002';
const API = `${BASE}/api/v1`;

export const options = {
  scenarios: {
    browse_and_hold: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 30 },
        { duration: '20s', target: 30 },
        { duration: '5s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{name:seatmap}': ['p(95)<300'],
    'http_req_duration{name:hold}': ['p(95)<400'],
  },
};

// 409 = seat already held (expected). Only real errors count as failures.
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

export function setup() {
  let showId = __ENV.SHOW_ID;
  if (!showId) {
    const events = http.get(`${API}/events?status=UPCOMING`).json();
    const slug = events.items[0].slug;
    const detail = http.get(`${API}/events/${slug}`).json();
    showId = detail.shows[0].id;
  }
  const map = http.get(`${API}/shows/${showId}/seatmap`).json();
  return { showId, seats: map.seats.map((s) => s.seatRef) };
}

export default function (data) {
  const mapRes = http.get(`${API}/shows/${data.showId}/seatmap`, { tags: { name: 'seatmap' } });
  check(mapRes, { 'seatmap 200': (r) => r.status === 200 });

  const seat = data.seats[Math.floor(Math.random() * data.seats.length)];
  const holdRes = http.post(
    `${API}/shows/${data.showId}/holds`,
    JSON.stringify({ seatRefs: [seat], holdToken: `${__VU}-${__ITER}-${Date.now()}` }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'hold' } },
  );
  check(holdRes, { 'hold 201/409': (r) => r.status === 201 || r.status === 409 });
}
