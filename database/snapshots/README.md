# Historical database snapshots

These SQL files are historical development exports retained for recovery and
traceability. They contain seeded or simulated demo data and are not the
canonical database definition.

Use `server/sql/schema.sql` together with `server/src/scripts/reset-db.ts` to
create a fresh development database. Do not import these snapshots over a live
hardware database without making a separate backup first.

The current local database backup created before removing simulated readings is
stored under `server/backups/` and is intentionally ignored by Git.
