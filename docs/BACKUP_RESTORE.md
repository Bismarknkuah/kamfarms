# KAM-ROMS — Backup & Restore

## Status (as of Phase 12)

The `backup_records` tracking table and Admin API (`GET /backups`,
`GET /backups/status`, `POST /backups`, `POST /backups/:id/complete`) are
implemented and real — see `backend/src/backup/`. What they are NOT: an
automated backup runner. This app does not call `pg_dump` itself; a
scheduled job (Railway's managed Postgres backup feature, or your own
cron) is expected to actually run the backup and then call
`POST /backups/:id/complete` to log the result. See the header comment in
`backend/src/backup/backup.service.ts` for why this boundary was drawn
deliberately rather than faked.

**Restore is not wired into the reset-approval workflow.** Phase 12's
`system-reset` module implements the full request → Finance Director
approval → MD approval → Admin-execute chain, but its *execution* step
is deliberately restricted to a two-table allowlist
(`InventoryTransaction`, `InventoryBalance`) — see
`docs/RESET_WORKFLOW.md`. A full database restore from a backup file is a
different, larger operation (it would need to run outside the
application's own transaction boundary, likely via `pg_restore` against a
maintenance connection) and is not implemented. Until it is, any restore
must be done manually, by someone with direct database access, following
the same spirit as the reset workflow: get sign-off before running it
against anything that matters.

## Manual backup (works today)

```bash
docker compose exec postgres pg_dump -U kam_roms -d kam_roms -F c -f /tmp/kam_roms_$(date +%Y%m%d_%H%M%S).dump
docker compose cp postgres:/tmp/kam_roms_*.dump ./backups/
```

On Railway, use the managed Postgres service's own backup feature instead
— see `docs/DEPLOYMENT.md`. Either way, call
`POST /backups` at the start and `POST /backups/:id/complete` with the
result afterward, so the Admin dashboard's backup status reflects what
actually happened.

## Manual restore (works today — development only; treat production
restores as an off-application, human-approved operation)

```bash
docker compose cp ./backups/kam_roms_YYYYMMDD_HHMMSS.dump postgres:/tmp/restore.dump
docker compose exec postgres pg_restore -U kam_roms -d kam_roms --clean --if-exists /tmp/restore.dump
```

**Never run a restore against a production database without getting
explicit sign-off first** — a restore silently discards everything
written since the backup, which is exactly the kind of destructive,
hard-to-reverse action spec section 37's approval gate exists to prevent,
even though restore itself isn't yet routed through that gate
mechanically.

## What a future phase would add to close this gap

- Extend `SystemResetService`'s `ResetType` handling (or a parallel
  `RestoreRequest` flow reusing the same dual-approval pattern) to cover
  restore specifically, with its own pre-restore snapshot and
  post-restore verification step
- A scheduled job that actually runs `pg_dump` and calls this app's
  backup API automatically, rather than requiring a manual trigger
