# Ticketing Platform

A BookMyShow-class event ticket booking platform. India-first, engineered for zero double-booking
under flash-sale traffic.

See [`ARCHITECTURE_AND_PLAN.md`](./ARCHITECTURE_AND_PLAN.md) for the full architecture and delivery plan.

## Stack

- **Backend:** NestJS (TypeScript)
- **Frontend:** Next.js 15 (App Router)
- **Data:** PostgreSQL (source of truth), Redis (locks/cache)
- **Monorepo:** pnpm workspaces + Turborepo
- **Cloud:** AWS (later phases)

## Layout

```
apps/
  api/     NestJS API (bounded-context modules)
  web/     Next.js web app
packages/
  shared/  Shared types, DTOs, constants
```

## Prerequisites

- Node >= 22 (see `.nvmrc`)
- pnpm 11
- Docker (for local Postgres + Redis)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env and start local infrastructure
cp .env.example .env
pnpm infra:up          # Postgres + Redis via docker compose

# 3. Run everything in dev
pnpm dev               # api on :6002, web on :6001
```

### Useful scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build all apps/packages |
| `pnpm lint` | Lint everything |
| `pnpm typecheck` | Type-check everything |
| `pnpm test` | Run tests |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop local Postgres + Redis |

## Health checks

- API: `GET http://localhost:6002/health`
- Web: `http://localhost:6001`
