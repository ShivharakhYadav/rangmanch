# Load & concurrency tests

Two complementary tests for the seat-booking hot path.

## Prerequisites

- API + infra running, database seeded (`pnpm --filter @ticketing/api db:seed`).
- Run the API with **relaxed rate limiting** so bursts aren't rejected with 429:
  ```bash
  THROTTLE_LIMIT=1000000 node apps/api/dist/main.js
  ```

## 1. Concurrency invariant check (correctness) — `concurrency-check.mjs`

Proves the **zero-double-booking** guarantee: for each seat it fires many
simultaneous holds from distinct holders and asserts exactly one wins.

```bash
node load/concurrency-check.mjs
# tune: SEATS=15 CONCURRENCY=60 node load/concurrency-check.mjs
```

Exit codes: `0` pass · `1` a seat was granted to >1 holder (oversell!) · `2`
non-201/409 responses (usually 429 — relax the throttle).

## 2. k6 throughput/latency (performance) — `k6/booking.js`

Measures seat-map read and hold latency under ramping virtual users. 409 (seat
already held) is treated as an expected response, not a failure.

```bash
k6 run load/k6/booking.js
# override target: API_BASE_URL=https://api.example.com k6 run load/k6/booking.js
```

Thresholds: <2% real HTTP failures, seat-map p95 < 300 ms, hold p95 < 400 ms.
