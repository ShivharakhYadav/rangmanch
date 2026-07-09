# Backups & Disaster Recovery

How the platform's data is backed up and restored. PostgreSQL is the only
durable store; Redis is intentionally ephemeral.

## What holds what

| Store | Contains | Durability |
|---|---|---|
| **PostgreSQL** | Everything that matters — users, venues/halls/seats, events/shows, orders, payments, invoices, tickets, outbox, audit log | Source of truth → **must be backed up** |
| **Redis** | Transient seat holds (TTL), OTP codes, rate-limit counters | Ephemeral → **no backup needed** (rebuilds naturally; losing it only drops in-flight 60s holds) |
| **Ticket PDFs** | Generated files under `storage/tickets` (local) / S3 (prod) | Regenerable from the order; back up S3 with versioning in prod |

## Targets

- **RPO** (max data loss): ≤ 5 min in production (continuous WAL archiving / PITR).
- **RTO** (max downtime): ≤ 30 min (restore latest base backup + replay WAL).

## Local (Docker) — backup & restore

`pg_dump` custom-format dump via the running container:

```bash
pnpm db:backup     # → backups/ticketing.dump
pnpm db:restore    # restores backups/ticketing.dump
```

Under the hood:

```bash
# Backup (compressed custom format)
docker exec ticketing-postgres pg_dump -U ticketing -Fc ticketing > backups/ticketing.dump

# Restore (drop + recreate objects, then load)
docker exec -i ticketing-postgres pg_restore -U ticketing -d ticketing --clean --if-exists < backups/ticketing.dump
```

`backups/` is gitignored — dumps must never be committed.

## Production (AWS RDS / Aurora)

- **Automated backups**: enable daily snapshots + **PITR** (transaction logs) with
  ≥ 7-day retention. This covers the RPO target without app changes.
- **Manual snapshot** before every schema migration / risky deploy.
- **Cross-region copy** of snapshots for regional DR.
- **Secrets/KMS**: encrypt backups at rest (RDS default) — never store dumps unencrypted.

## Restore drill (run quarterly)

1. Provision a scratch DB (or a fresh local container).
2. Restore the latest dump/snapshot into it.
3. Point a staging API at it; run `pnpm --filter @ticketing/api prisma:migrate` (should be a no-op — schema already current).
4. Smoke-test: list events, load a seat map, confirm counts match production expectations.
5. Record restore time; confirm it's within RTO.

## After a restore — reconcile Redis

Redis holds are transient, so nothing to restore. On boot the app rebuilds seat
availability from Postgres (`ShowSeat.status`); any holds that were in-flight at
the moment of failure simply expire. No manual step required.
