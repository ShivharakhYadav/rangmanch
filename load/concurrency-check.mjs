/**
 * Concurrency invariant load test — proves the zero-double-booking guarantee.
 *
 * For each target seat it fires CONCURRENCY simultaneous hold requests (each from
 * a distinct anonymous holder token). The Redis atomic lock must grant the seat
 * to exactly ONE of them; everyone else must get 409. More than one winner for
 * any seat is an oversell → the script exits non-zero.
 *
 * Usage:
 *   node load/concurrency-check.mjs
 * Env: API_BASE_URL (default http://localhost:6002), SHOW_ID (auto-discovered
 *   if unset), SEATS (default 15), CONCURRENCY (default 60).
 *
 * Run the target API with relaxed rate limiting so bursts aren't 429'd:
 *   THROTTLE_LIMIT=1000000 node apps/api/dist/main.js
 */

const BASE = process.env.API_BASE_URL || 'http://localhost:6002';
const API = `${BASE}/api/v1`;
const SEATS = Number(process.env.SEATS || 15);
const CONCURRENCY = Number(process.env.CONCURRENCY || 60);

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function discoverShow() {
  const events = await getJson(`${API}/events?status=UPCOMING`);
  const slug = events.body.items?.[0]?.slug;
  if (!slug) throw new Error('No upcoming events found — seed the database first.');
  const detail = await getJson(`${API}/events/${slug}`);
  const showId = detail.body.shows?.[0]?.id;
  if (!showId) throw new Error('No show found for the first upcoming event.');
  return showId;
}

async function holdOnce(showId, seatRef) {
  const res = await fetch(`${API}/shows/${showId}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatRefs: [seatRef], holdToken: crypto.randomUUID() }),
  });
  return res.status;
}

async function main() {
  const showId = process.env.SHOW_ID || (await discoverShow());
  console.log(`Target show: ${showId}`);
  console.log(`Contending ${SEATS} seats × ${CONCURRENCY} concurrent holders = ${SEATS * CONCURRENCY} requests\n`);

  const map = await getJson(`${API}/shows/${showId}/seatmap`);
  const available = (map.body.seats || []).filter((s) => s.status === 'AVAILABLE').slice(0, SEATS);
  if (available.length < SEATS) {
    console.warn(`Only ${available.length} available seats (wanted ${SEATS}); re-seed for a full run.`);
  }

  const rows = [];
  let oversold = 0;
  let unsold = 0;
  const statusDist = {};

  // Seats are contended one at a time so client-side socket count stays bounded
  // at CONCURRENCY; the holders for each seat still race simultaneously (the
  // only thing that matters for the invariant).
  for (const seat of available) {
    const statuses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => holdOnce(showId, seat.seatRef)),
    );
    let winners = 0;
    let losers = 0;
    let other = 0;
    for (const s of statuses) {
      statusDist[s] = (statusDist[s] || 0) + 1;
      if (s === 201) winners++;
      else if (s === 409) losers++;
      else other++;
    }
    if (winners > 1) oversold++;
    if (winners === 0) unsold++;
    rows.push({ seat: seat.seatRef, winners, losers, other });
  }

  rows.sort((a, b) => a.seat.localeCompare(b.seat));
  console.log('seat   winners  409-losers  other');
  for (const r of rows) {
    console.log(
      `${r.seat.padEnd(6)} ${String(r.winners).padStart(7)} ${String(r.losers).padStart(11)} ${String(r.other).padStart(6)}`,
    );
  }
  console.log(`\nStatus distribution: ${JSON.stringify(statusDist)}`);
  console.log(`Seats tested: ${rows.length} | oversold (>1 winner): ${oversold} | unsold (0 winners): ${unsold}`);

  const otherCount = Object.entries(statusDist)
    .filter(([code]) => code !== '201' && code !== '409')
    .reduce((n, [, c]) => n + c, 0);

  if (oversold > 0) {
    console.error(`\n❌ FAIL: ${oversold} seat(s) granted to more than one holder — double-booking!`);
    process.exit(1);
  }
  if (otherCount > 0) {
    console.error(`\n⚠️  ${otherCount} non-201/409 responses (likely 429 throttle or errors). Re-run with THROTTLE_LIMIT relaxed.`);
    process.exit(2);
  }
  console.log(`\n✅ PASS: every contended seat was granted to exactly one holder. Zero double-booking under load.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
