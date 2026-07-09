# Rangmanch — Build Progress

BookMyShow-class event ticket booking platform. India-first. See
[`ARCHITECTURE_AND_PLAN.md`](./ARCHITECTURE_AND_PLAN.md) for the full design.

**Repo:** github.com/ShivharakhYadav/rangmanch · **CI:** GitHub Actions (green) ·
**Last updated:** 2026-07-09

## Stack (as built)

NestJS (TypeScript) API · Next.js 15 web · PostgreSQL (Prisma) · Redis (ioredis) ·
pnpm + Turborepo monorepo. Ports: web **6001**, API **6002**, Postgres **5433**, Redis **6379**.

## Local run

```bash
pnpm install
pnpm infra:up            # Postgres + Redis (docker)
pnpm --filter @ticketing/api db:seed
pnpm dev                 # api :6002, web :6001
```
Admin login (dev): phone `9000000000` (OTP code returned in the response in dev).

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations (monorepo, NestJS, Next.js, docker infra) | ✅ Done |
| 1 | Catalog & Discovery (venues/halls/events/shows, listing, detail) | ✅ Done |
| 2 | Seat Locking Core (Redis atomic locks, seat map, WS live updates) | ✅ Done |
| 3 | Booking & Payments (OTP+JWT auth, payment saga, invoices) | ✅ Done |
| 4 | WhatsApp Ticketing (PDF + QR, outbox relay) | ✅ Done |
| 5 | Admin & Reporting (RBAC, offline blocking, refunds, reports, audit) | ✅ Done |
| 6 | Hardening & Launch | ✅ Done |

### Phase 6 breakdown

| Item | Status |
|---|---|
| ESLint + Prettier + Husky pre-commit | ✅ Done |
| GitHub Actions CI (lint/typecheck/build/test) | ✅ Done |
| Security hardening (helmet, rate limiting, OTP/secret/CORS) | ✅ Done |
| Load & concurrency testing (Node invariant check + k6) | ✅ Done |
| Observability (Prometheus /metrics + OpenTelemetry tracing) | ✅ Done |
| socket.io Redis adapter (multi-instance live updates) | ✅ Done |
| PDF-as-WhatsApp media (send file, not just link) | ✅ Done |
| Backups / DR runbook ([`docs/DR.md`](./docs/DR.md)) | ✅ Done |

**All planned phases (0–6) are complete.** The platform is production-shaped;
what remains is deployment and swapping mock integrations for real ones.

---

## Next up (deployment & go-live)

1. **AWS deployment** — Terraform for VPC/RDS/ElastiCache/ECS, container images, CI→deploy.
2. **Wire real integrations** — Razorpay, Gupshup (WhatsApp), MSG91 (OTP) via env.
3. **Post-MVP features** (below) as the business prioritises.

## Deferred / needs external input

- **Real integrations** (currently mock/dev, swap via env when creds arrive):
  Razorpay (payments), Gupshup (WhatsApp), MSG91 (OTP).
- **Kafka** — outbox events are consumed by an in-process relay; swap for a Kafka
  consumer at scale (contract unchanged).
- **AWS deployment** — Terraform/infra not yet built (plan targets AWS ap-south-1).

## Post-MVP backlog (from the plan)

Virtual waiting room (flash-sale traffic) · discount coupons · multi-language
(Gujarati/Hindi/English) · QR entry-validation app for venue gates.

---

## Commit history (phase-wise)

| Commit | What |
|---|---|
| `71b3abf` | Phases 0–3 initial import |
| `39933f1` | Phase 4 — WhatsApp ticketing |
| `7a46ee5` | Phase 5 — Admin + 401 auth fix |
| `450306a`, `9af430e` | Phase 6 — ESLint + Husky + CI |
| `c841ef0` | Phase 6 — security hardening |
| `ebdf7d1` | Phase 6 — load & concurrency tests |
| `2a9643c` | Phase 6 — observability |
| `8cbd09a` | PROGRESS.md tracker |
| `3ed1bbe` | Phase 6 — socket.io Redis adapter + WhatsApp document |
| `87dc559` | Phase 6 — backups/DR runbook |
