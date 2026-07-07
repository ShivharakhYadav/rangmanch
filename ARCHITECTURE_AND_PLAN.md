# Theatre / Event Ticket Booking Platform — Architecture & Delivery Plan

> **Vision:** A BookMyShow-class ticket booking platform. Launching India-first (Ahmedabad),
> engineered from day one to survive flash-sale traffic without double-booking a single seat.
>
> **Status:** Planning. No code yet.
> **Last updated:** 2026-07-07

---

## 0. Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **NestJS (TypeScript)** | One language across stack, fastest velocity, scales to ~100K concurrent with Redis/Kafka |
| Frontend | **Next.js 15 (App Router) + TS** | SSR/edge-cached SEO pages, reuses existing team expertise |
| Cloud | **AWS** | Managed building blocks for every hard part (RDS, ElastiCache, MSK, EKS) |
| Scope | **MVP-first, scale-ready** | Modular monolith, real locking/payments/WhatsApp, single city; structured to scale |
| Market | **India only** | Razorpay/UPI, Gupshup WhatsApp BSP, INR, India data-residency |
| Architecture | **Modular monolith** | Extract the seat-inventory hot path to a service only when scale demands |

> **WordPress is explicitly rejected.** It cannot deliver the concurrency, consistency, or
> flash-sale resilience a BookMyShow competitor requires.

---

## 1. Requirements

### 1.1 Functional (MVP)

**Public / User**
- Home page with highlights, featured & trending shows
- Event listing categorized **Past / Ongoing / Upcoming**, filter by city/venue/date/genre
- Event detail page: cast (singers, orchestra, anchor), sponsors, synopsis, showtimes
- **Book flow:** select show → interactive seat map per hall → add seats to cart
- **Seat hold** on add-to-cart with a countdown timer (see §4 — recommend 5–7 min, not 1 min)
- Login / registration (OTP + email) required before payment
- Payment via Razorpay (UPI, cards, netbanking, wallets)
- Invoice with unique reference number
- **Ticket auto-delivered on WhatsApp** (PDF + QR)
- My Profile: booking history, download/resend tickets
- Static pages: About Us, Contact Us

**Admin (custom dashboard, not WP)**
- CRUD events; assign events to halls/showtimes
- Define **custom seating layouts per hall** (rows, seat categories, per-category pricing)
- **Pre-block seats** for offline sales
- Manage bookings, cancellations, refunds, invoices
- Sales & booking reports, occupancy analytics
- Role-based access (Super Admin, Venue Manager, Support)

### 1.2 Non-Functional

| Attribute | Target |
|---|---|
| Concurrency | 1,000+ steady; burst design for 50K+ on hot releases |
| Double-booking | **Zero, guaranteed** (hard invariant) |
| Seat-map render | p99 < 50 ms (cached read model) |
| Booking API p99 | < 300 ms |
| Availability | 99.9% |
| Auth | OTP + email; JWT access + refresh |
| Payments | PCI-safe (tokenization; never store card data) |
| Data residency | India region (ap-south-1) |
| Backups | Automated daily + PITR |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Web frontend | Next.js 15 (App Router), React, TypeScript, Tailwind + shadcn/ui, TanStack Query |
| Mobile | PWA first; React Native later |
| API | NestJS (REST + OpenAPI), Zod/class-validator, WebSocket gateway for live seat maps |
| Auth | NestJS + JWT (access/refresh), OTP via SMS provider (MSG91), Redis-backed sessions |
| Primary DB | PostgreSQL 16 (AWS RDS/Aurora), source of truth |
| Cache / locks | Redis 7 (AWS ElastiCache) — seat locks, seat-map cache, rate limits, OTP store |
| Events / streaming | Kafka (AWS MSK) — outbox relay, notifications, analytics, waiting-room log |
| Saga orchestration | Temporal (durable execution for payment workflow) |
| Object storage | S3 (invoices, ticket PDFs, event media) + CloudFront CDN |
| Payments | Razorpay (Orders API + webhooks) |
| WhatsApp | Meta WhatsApp Cloud API via Gupshup (BSP), template messages |
| Search (later) | OpenSearch |
| IaC | Terraform |
| Containers | Docker → AWS ECS Fargate (MVP) → EKS if needed |
| Observability | OpenTelemetry, Amazon CloudWatch + Grafana/Prometheus, Sentry |
| CI/CD | GitHub Actions → ECR → ECS, with staging/prod environments |

---

## 3. High-Level Architecture

```
                    ┌─────────────┐
   Users ─────────► │  CloudFront │ (CDN: static, media, cached seat maps)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐        ┌────────────────────┐
                    │  Next.js    │◄──────►│  WAF + API Gateway  │
                    │  (SSR/edge) │        │  (rate limit, auth) │
                    └─────────────┘        └─────────┬──────────┘
                                                     │
                                   ┌─────────────────▼──────────────────┐
                                   │       NestJS Modular Monolith        │
                                   │  ┌────────┬──────────┬────────────┐  │
                                   │  │Catalog │ Inventory│  Booking   │  │
                                   │  ├────────┼──────────┼────────────┤  │
                                   │  │Payments│  Auth    │Notification│  │
                                   │  ├────────┴──────────┴────────────┤  │
                                   │  │      Admin  │  Reporting        │  │
                                   │  └───────────────────────────────┘  │
                                   └───┬───────┬────────┬────────┬───────┘
                                       │       │        │        │
                            ┌──────────▼┐ ┌────▼───┐ ┌──▼───┐ ┌──▼────────┐
                            │PostgreSQL │ │ Redis  │ │Kafka │ │ Temporal  │
                            │ (truth)   │ │(locks) │ │(bus) │ │  (saga)   │
                            └───────────┘ └────────┘ └──────┘ └───────────┘
                                                        │
                                        ┌───────────────┼───────────────┐
                                   ┌────▼────┐    ┌──────▼─────┐   ┌─────▼─────┐
                                   │Razorpay │    │  WhatsApp   │   │ Analytics │
                                   │(payment)│    │ (Gupshup)   │   │(OpenSearch│
                                   └─────────┘    └─────────────┘   │/ClickHouse)│
                                                                    └───────────┘
```

### 3.1 Bounded Contexts (NestJS modules)

Each is a self-contained module with its own service layer, so any hot one can be lifted into a
standalone microservice later without a rewrite.

- **Catalog** — events, venues, halls, shows, cast, sponsors. Read-heavy, heavily cached.
- **Inventory / Seating** — seat layouts, seat state, **locking (the hot path)**. Designed for extraction.
- **Booking** — cart, orders, invoices, booking lifecycle.
- **Payments** — Razorpay integration, saga coordination, refunds, webhook handling.
- **Notifications** — WhatsApp, email, SMS; consumes Kafka events.
- **Auth / Users** — OTP + email auth, profiles, RBAC.
- **Admin** — event/hall/layout management, offline seat blocking, moderation.
- **Reporting** — sales, occupancy, revenue analytics.

### 3.2 Event-driven backbone

- **Transactional outbox:** every state change writes an outbox row in the *same* DB transaction;
  a relay publishes to Kafka. Guarantees "event emitted iff commit succeeded" — no dual-write bug.
- Notifications, analytics, and search indexing all consume Kafka asynchronously, keeping the
  booking hot path fast.

---

## 4. The Three Hard Problems

### 4.1 Zero Double-Booking (the core invariant)

**Never** use `SELECT … FOR UPDATE` on seats — it serializes concurrent locks and destroys throughput.
Layered defense instead:

1. **Redis atomic locks** — `SET seat:{show}:{seat} {userId} NX EX {ttl}`. Of N concurrent
   requests for one seat, exactly one wins; the rest are rejected instantly *without touching Postgres*.
2. **Lua script** for multi-seat carts — all-or-nothing atomic acquisition of a seat group.
3. **Seat state machine:** `AVAILABLE → LOCKED (TTL) → RESERVED (payment) → BOOKED`, auto-revert to
   `AVAILABLE` on TTL expiry (abandoned cart).
4. **PostgreSQL final guard** — `UNIQUE(show_id, seat_id)` on confirmed bookings + optimistic
   `version` column. Even if Redis fails catastrophically, the DB physically cannot double-book.

> **⚠️ Decision needed:** The SRS says a **1-minute** hold. That's too short — users can't realistically
> complete OTP + payment in 60s, causing mass seat loss and cart abandonment. Industry standard is
> **5–10 min**. **Recommendation: 7-minute hold** with a visible countdown. Please confirm.

**Live updates:** WebSocket gateway with a Redis backplane pushes "seat taken/released" to everyone
viewing the same show, so seat maps stay fresh without polling.

### 4.2 Payment Consistency (Saga)

Money + inventory across systems can't use a single ACID transaction. We use a **Temporal saga**:

```
OrderCreated → ReserveSeats(Redis LOCKED→RESERVED)
            → CreateRazorpayOrder
            → [await webhook: PaymentSuccess | PaymentFailed | Timeout]
   success → ConfirmBooking (Postgres BOOKED) → outbox: BookingConfirmed
                                              → WhatsApp ticket + invoice
   fail/TO → ReleaseSeats (compensation) → mark order Cancelled
```

- **Idempotency keys** on every step and on the client "pay" action → no double-charge on retry.
- **Webhook verification:** validate Razorpay signature + dedup by event ID (ignore replays).
- **Compensating transactions** release seats on failure/timeout automatically.

### 4.3 Flash-Sale Traffic (deferred to post-MVP, but designed for)

For blockbuster on-sales, autoscaling isn't fast enough. Plan (build when a hot show is scheduled):
- **Virtual waiting room** — token-based FIFO admission; Kafka as durable queue log so state
  survives Redis loss; client reconnection preserves position.
- **Token/leaky bucket** shapes admission (e.g. 500 users/min) into the protected booking zone.
- **Per-user rate limits** — max seats/locks per user, enforced at gateway + app via Redis `INCR`.

MVP ships the rate-limiting and seat-map caching now; the full waiting room is a switch we flip later.

---

## 5. Data Model (core tables, indicative)

```
venues(id, name, city, address, geo)
halls(id, venue_id, name, capacity)
seat_layouts(id, hall_id, version, layout_json)      -- rows, sections, coordinates
seat_categories(id, hall_id, name, color)            -- e.g. Platinum/Gold/Silver
events(id, title, description, status[past|ongoing|upcoming], genre, media)
event_cast(event_id, role, name)                     -- singer/orchestra/anchor
event_sponsors(event_id, name, logo_url)
shows(id, event_id, hall_id, starts_at, base_price)
show_seats(id, show_id, seat_ref, category_id, price, status)  -- UNIQUE(show_id, seat_ref)
carts(id, user_id, show_id, expires_at)
cart_items(cart_id, show_seat_id)
orders(id, user_id, show_id, status, amount, version)
order_seats(order_id, show_seat_id)                  -- UNIQUE(show_seat_id) once BOOKED
bookings(id, order_id, reference_no, status, booked_at)
payments(id, order_id, razorpay_order_id, status, idempotency_key)
invoices(id, booking_id, reference_no, pdf_url)
tickets(id, booking_id, qr_code, whatsapp_status)
users(id, phone, email, name, role)
outbox(id, aggregate, event_type, payload, published_at)
```

Confirmed bookings are the source of truth; Redis holds only ephemeral lock/hold state.
A denormalized **seat-map read model** (JSON in Redis/Postgres) serves the seat grid in <50ms.

---

## 6. Security

- **Auth:** OTP (MSG91) + email; short-lived JWT access + rotating refresh tokens; Redis session store.
- **Payments:** PCI-DSS SAQ-A — card data never touches our servers; Razorpay tokenization only.
- **Transport/rest:** TLS everywhere; encryption at rest (RDS, S3, ElastiCache); AWS Secrets Manager (no secrets in code/env files committed).
- **App:** OWASP Top 10 hardening, input validation (Zod/class-validator), parameterized queries, output encoding.
- **Abuse control:** WAF, per-IP + per-user rate limiting, bot/scalper detection on booking endpoints, idempotency keys.
- **Admin:** RBAC, audit log of all admin actions, MFA for admin accounts.
- **Webhooks:** signature verification + replay protection.
- **Compliance:** India data residency (ap-south-1), privacy policy, data-retention rules, DPDP Act alignment.

---

## 7. Scalability & Performance

- **Stateless app tier** on ECS Fargate → horizontal autoscale on CPU/latency.
- **PostgreSQL:** primary + read replicas; connection pooling (PgBouncer); partition hot tables (`show_seats`) by show/event.
- **Redis:** cluster mode for locks/cache; the double-booking defense scales linearly.
- **Kafka:** partition by event/show for parallel, ordered processing.
- **CDN:** CloudFront for static assets, media, and cached seat maps (>95% cache hit target).
- **CQRS-lite:** separate read model for seat maps and listings; writes stay narrow and fast.
- **Graceful degradation:** if a non-critical dependency (analytics, search) is down, booking still works.

---

## 8. Observability & DevOps

- **Tracing/metrics/logs:** OpenTelemetry → CloudWatch + Grafana/Prometheus; Sentry for errors.
- **SLO dashboards:** booking success rate, lock contention, seat-map latency, payment success rate.
- **Alerting:** on double-booking attempts (should be zero), payment saga failures, TTL-expiry spikes.
- **CI/CD:** GitHub Actions → lint/test/build → ECR → ECS; blue/green or canary to prod; IaC via Terraform.
- **Environments:** dev · staging · prod, each isolated.
- **Load testing:** k6 scenarios simulating flash-sale contention before every major release.

---

## 9. Phased Delivery Plan

> Sequenced so the **riskiest thing (seat-locking correctness) is proven first**, then we build outward.

### Phase 0 — Foundations (setup)
Repo/monorepo scaffolding, AWS accounts + Terraform baseline (VPC, RDS, ElastiCache, ECR, ECS), CI/CD, auth (OTP+email), base Next.js shell, design system. **Exit:** a logged-in user can hit a health-checked API in staging.

### Phase 1 — Catalog & Discovery
Venues, halls, seat layouts, events, shows; admin CRUD for these; public home + event listing (Past/Ongoing/Upcoming) + event detail pages, cached & SEO-friendly. **Exit:** browse real events end to end.

### Phase 2 — Seat Locking Core ★ (highest risk, prove early)
Interactive seat map, Redis lock/hold with TTL + Lua multi-seat atomicity, seat state machine, WebSocket live updates, Postgres unique-constraint guard. **Load-test under contention.** **Exit:** thousands of concurrent users cannot double-book; abandoned carts auto-release.

### Phase 3 — Booking + Payments (Saga)
Cart → order → Razorpay Orders API → Temporal saga → confirm/compensate; idempotency + webhook verification; invoice generation. **Exit:** a real payment produces a confirmed, non-double-booked booking, and a failed payment releases seats.

### Phase 4 — WhatsApp Ticketing & Profile
Gupshup integration, ticket PDF + QR, auto-delivery on confirmation, resend; My Profile with booking history. **Exit:** paying users receive a scannable ticket on WhatsApp.

### Phase 5 — Admin, Offline Blocking & Reporting
Full admin dashboard, offline seat pre-blocking, cancellations/refunds, sales & occupancy reports, RBAC + audit log. **Exit:** venue staff can run operations without engineering.

### Phase 6 — Hardening & Launch
Security review/pentest, load/soak tests, observability polish, backups/DR drill, runbooks. **Exit:** production launch (Ahmedabad).

### Post-MVP (build when demand appears)
Virtual waiting room, discount coupons, multi-language (Gujarati/Hindi/English), QR entry-validation app for gates, multi-city/multi-region, extract Inventory service to Go if the hot path demands it, search (OpenSearch).

---

## 10. Open Decisions (need your input before/at kickoff)

1. **Seat hold duration** — SRS says 1 min; strongly recommend **7 min**. Confirm.
2. **OTP provider** — MSG91 assumed (India). Any preferred vendor?
3. **WhatsApp BSP** — Gupshup assumed; Meta requires a verified Business account + template approval (lead time). Do you have one?
4. **Razorpay account** — SRS says the client provides gateway credentials. Timeline for those?
5. **Repo strategy** — new dedicated repo, or extend the existing `dms-simulation-user` codebase?
6. **Monorepo vs polyrepo** — recommend a monorepo (Turborepo) for frontend + backend + infra.
7. **Timeline & team size** — to right-size scope per phase.
```
