#!/usr/bin/env bash
#
# Build + deploy the Fathom clone to the VM.
#
#   ./scripts/deploy.sh              build, ship, restart, health check
#   ./scripts/deploy.sh --fresh-db   also upload the local SQLite DB (OVERWRITES live data)
#
# Safe for concurrent use: an flock serialises deploys, a local smoke test runs
# before anything is shipped, and a failed remote health check rolls back to the
# previous release. All four subagents run this same script.
#
set -euo pipefail

HOST="${DEPLOY_HOST:-tests2}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/fathom}"
APP_PORT="${APP_PORT:-3100}"
PUBLIC_URL="${PUBLIC_URL:-http://51.170.90.41/}"
FRESH_DB=0
for arg in "$@"; do
  [ "$arg" = "--fresh-db" ] && FRESH_DB=1
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RELEASE="rel-$(date +%Y%m%d-%H%M%S)-$$"
STAGE="$(mktemp -d /tmp/fathom-stage-XXXXXX)"
LOCK_FILE="/tmp/fathom-deploy.lock"
LOG_FILE="/tmp/fathom-deploy-$(date +%H%M%S).log"

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# --- serialise concurrent deploys (subagents share this host) ----------------
exec 200>"$LOCK_FILE"
if ! flock -w 1800 200; then
  echo "Timed out waiting for another deploy to finish" >&2
  exit 1
fi

log "typecheck"
npx tsc --noEmit

log "build (next build)"
npm run build

log "stage standalone output"
if [ ! -f .next/standalone/server.js ]; then
  echo "next build did not produce .next/standalone — check next.config.ts output" >&2
  exit 1
fi
cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next" "$STAGE/public"
cp -a .next/static "$STAGE/.next/"
cp -a public/. "$STAGE/public/"
if [ ! -f data/fathom.db ]; then
  echo "  no local database yet — creating an empty one"
  npx tsx scripts/new-db.ts
fi

log "local smoke test (standalone server)"
SMOKE_PORT="${SMOKE_PORT:-3999}"
PORT=$SMOKE_PORT HOSTNAME=127.0.0.1 DATABASE_PATH="$ROOT/data/fathom.db" \
  node "$STAGE/server.js" >"$STAGE/smoke.log" 2>&1 &
SMOKE_PID=$!
SMOKE_OK=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$SMOKE_PORT/api/health" >/dev/null 2>&1; then
    SMOKE_OK=1
    break
  fi
  sleep 0.5
done
# the sign-in page must answer too (app routes are behind auth now) — check while
# the smoke server is still up
if [ "$SMOKE_OK" = "1" ]; then
  if ! curl -fsS --max-time 3 "http://127.0.0.1:$SMOKE_PORT/login" >/dev/null 2>&1; then
    echo "login page did not answer" >&2
    SMOKE_OK=0
  fi
fi
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
if [ "$SMOKE_OK" != "1" ]; then
  echo "smoke test failed:" >&2
  tail -40 "$STAGE/smoke.log" >&2
  exit 1
fi
echo "  health + login OK"

log "ship $RELEASE to $HOST"
TARBALL="/tmp/fathom-$RELEASE.tar.gz"
tar -C "$STAGE" -czf "$TARBALL" .
scp -q "$TARBALL" "$HOST:/tmp/fathom-$RELEASE.tar.gz"

scp -q "$ROOT/ops/fathom.service" "$HOST:/tmp/fathom.service"
scp -q "$ROOT/ops/nginx-fathom.conf" "$HOST:/tmp/nginx-fathom.conf"
scp -q "$ROOT/ops/stt/transcribe.py" "$HOST:/tmp/transcribe.py"
scp -q "$ROOT/data/fathom.db" "$HOST:/tmp/fathom-upload.db"

log "install + restart remote"
ssh -q "$HOST" "bash -s" <<REMOTE
set -euo pipefail
export PATH=/opt/node22/bin:\$PATH
REL="$REMOTE_ROOT/releases/$RELEASE"
mkdir -p "\$REL" "$REMOTE_ROOT/data" "$REMOTE_ROOT/data/uploads" "$REMOTE_ROOT/releases" "$REMOTE_ROOT/stt"
rm -rf "\$REL"
mkdir -p "\$REL"
tar -xzf "/tmp/fathom-$RELEASE.tar.gz" -C "\$REL"
rm -f "/tmp/fathom-$RELEASE.tar.gz"
chmod +x "\$REL/server.js" 2>/dev/null || true

# local speech-to-text helper used by /api/ingest for recorded audio
cp /tmp/transcribe.py "$REMOTE_ROOT/stt/transcribe.py"
rm -f /tmp/transcribe.py
if [ ! -x "$REMOTE_ROOT/stt/bin/python" ]; then
  echo "  WARNING: STT venv missing at $REMOTE_ROOT/stt — run ops/install-stt.sh on the server"
fi

if [ ! -f "$REMOTE_ROOT/data/fathom.db" ]; then
  echo "  no remote db yet — will upload local database"
  NEED_DB=1
else
  NEED_DB=0
fi

# systemd unit
sudo cp /tmp/fathom.service /etc/systemd/system/fathom.service
# nginx site (always refresh — the config is part of the release)
sudo cp /tmp/nginx-fathom.conf /etc/nginx/sites-available/fathom
if [ ! -e /etc/nginx/sites-enabled/fathom ]; then
  sudo ln -sf /etc/nginx/sites-available/fathom /etc/nginx/sites-enabled/fathom
fi
sudo nginx -t >/dev/null

# swap current -> new, keep previous for rollback
if [ -L "$REMOTE_ROOT/current" ]; then
  PREV="\$(readlink -f "$REMOTE_ROOT/current")"
else
  PREV=""
fi
ln -sfn "\$REL" "$REMOTE_ROOT/current.tmp"
mv -T "$REMOTE_ROOT/current.tmp" "$REMOTE_ROOT/current"
echo "\$PREV" > "$REMOTE_ROOT/.previous"

sudo systemctl daemon-reload
sudo systemctl enable fathom >/dev/null 2>&1 || true
sudo systemctl restart fathom
sudo systemctl reload nginx
sleep 1

# wait for health
OK=0
for i in \$(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 1
done

if [ "\$OK" = "1" ]; then
  # the sign-in page must answer too (app routes are behind auth now)
  curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/login" >/dev/null 2>&1 || OK=0
fi

if [ "\$OK" != "1" ]; then
  echo "HEALTH CHECK FAILED — rolling back"
  sudo journalctl -u fathom -n 60 --no-pager >&2 || true
  PREV="\$(cat "$REMOTE_ROOT/.previous" 2>/dev/null || true)"
  if [ -n "\$PREV" ] && [ -d "\$PREV" ]; then
    ln -sfn "\$PREV" "$REMOTE_ROOT/current"
    sudo systemctl restart fathom
    sleep 2
    curl -fsS --max-time 3 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && echo "rolled back OK"
  fi
  exit 1
fi

# upload the local db only when the server does not have one yet (or --fresh-db)
if [ "$FRESH_DB" = "1" ] || [ "\$NEED_DB" = "1" ]; then
  echo "  uploading database"
  sudo systemctl stop fathom || true
  cp /tmp/fathom-upload.db "$REMOTE_ROOT/data/fathom.db"
  rm -f "$REMOTE_ROOT/data/fathom.db-wal" "$REMOTE_ROOT/data/fathom.db-shm"
  sudo chown ubuntu:ubuntu "$REMOTE_ROOT/data/fathom.db"
  sudo systemctl start fathom
  sleep 2
  curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null \
    || { echo "health failed after db upload" >&2; sudo journalctl -u fathom -n 40 --no-pager >&2; exit 1; }
fi
rm -f /tmp/fathom-upload.db

# prune old releases, keep the last 4
ls -1dt $REMOTE_ROOT/releases/*/ 2>/dev/null | tail -n +5 | xargs -r rm -rf
echo "deployed: $RELEASE"
REMOTE

log "verify $PUBLIC_URL"
if curl -fsS --max-time 10 "${PUBLIC_URL}api/health" >/dev/null; then
  echo "  public health OK: ${PUBLIC_URL}api/health"
else
  echo "  WARNING: public health check failed for $PUBLIC_URL" >&2
  exit 1
fi
curl -fsS --max-time 10 "${PUBLIC_URL}login" >/dev/null && echo "  public login page OK"
echo "DEPLOYED  $RELEASE"
echo "LOG       $LOG_FILE"
