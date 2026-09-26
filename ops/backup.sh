#!/usr/bin/env bash
#
# Nightly backup of the SQLite database + recorded media.
#
#   /srv/fathom/ops/backup.sh            run now (also what cron runs)
#
# Keeps 7 days of snapshots in /srv/fathom/backups. Uses better-sqlite3's
# online backup API, so the app can stay up while the snapshot is taken.
#
set -euo pipefail

ROOT="${REMOTE_ROOT:-/srv/fathom}"
OUT="$ROOT/backups"
NODE="${NODE_BIN:-/opt/node22/bin/node}"
DB="$ROOT/data/fathom.db"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
mkdir -p "$OUT"

status=0

if [ -f "$DB" ]; then
  DEST="$OUT/fathom-$STAMP.db"
  if DB_PATH="$DB" DEST="$DEST" NODE_PATH="$ROOT/current/node_modules" "$NODE" - <<'JS'
const Database = require("better-sqlite3");
const db = new Database(process.env.DB_PATH, { readonly: true });
const rows = db.pragma("integrity_check");
if (String(rows[0]?.integrity_check) !== "ok") {
  console.error("integrity_check failed:", JSON.stringify(rows));
  process.exit(2);
}
db.backup(process.env.DEST)
  .then(() => { console.log("backup ok ->", process.env.DEST); db.close(); process.exit(0); })
  .catch((e) => { console.error("backup failed:", e); process.exit(1); });
JS
  then
    gzip -f "$DEST"
    echo "$(date -Is) db ok"
  else
    echo "$(date -Is) DB BACKUP FAILED" >&2
    status=1
  fi
else
  echo "$(date -Is) no database at $DB — skipped" >&2
fi

if [ -d "$ROOT/data/uploads" ]; then
  tar -czf "$OUT/uploads-$STAMP.tgz" -C "$ROOT/data" uploads
  echo "$(date -Is) uploads ok ($(du -sh "$OUT/uploads-$STAMP.tgz" | cut -f1))"
fi

# prune old snapshots (keeps the newest of each series past KEEP_DAYS)
find "$OUT" -name 'fathom-*.db.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
find "$OUT" -name 'uploads-*.tgz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
du -sh "$OUT" 2>/dev/null || true

exit $status
