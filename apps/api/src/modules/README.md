# Bounded-context modules

Each subfolder here is a self-contained NestJS module (its own controllers, services,
repositories, and DTOs) mapping to a bounded context from `ARCHITECTURE_AND_PLAN.md` §3.1.
They are structured so a hot module (e.g. `inventory`) can be extracted into a standalone
service later without a rewrite.

Planned modules (added in their respective phases):

| Module | Phase | Responsibility |
|---|---|---|
| `auth` | 0/1 | OTP + email auth, JWT, RBAC |
| `catalog` | 1 | Events, venues, halls, shows, cast, sponsors |
| `inventory` | 2 | Seat layouts, seat state, **Redis locking (hot path)** |
| `booking` | 3 | Cart, orders, invoices, booking lifecycle |
| `payments` | 3 | Razorpay integration, saga, refunds, webhooks |
| `notifications` | 4 | WhatsApp / email / SMS (Kafka consumers) |
| `admin` | 5 | Event/hall/layout management, offline seat blocking |
| `reporting` | 5 | Sales, occupancy, revenue analytics |

Currently only `health` (top-level) exists — Phase 0 foundation.
