# Fathom — AI meeting notetaker

Self-hosted meeting notes with **real accounts**: sign up, confirm your email, record or import
a meeting, and get LLM summaries, action items, transcript search, highlights and shareable
public clip links.

**Live:** https://tests.thetrillioniar.me/ · **Repo:** https://github.com/Abdulhadi446/fathom-clone

## What it does

- **Accounts** — email + password (scrypt-hashed), server-side sessions in an `HttpOnly`
  cookie, every row scoped to the account that created it. **Email confirmation** and
  **password reset** links go out through Resend; `/settings` can change the password and
  **delete the account** (password-confirmed, cascades to every meeting and upload).
- **Capture** — `/ingest` accepts pasted text, a `.txt`/`.vtt`/`.srt` upload, a **microphone
  recording** or a **screen recording**. You can listen back to the take before saving it.
- **Transcription** — recordings are transcribed **on this machine** by faster-whisper
  (`ops/install-stt.sh`), so audio never leaves the box and no STT API key is needed.
  A pasted transcript always wins over transcription.
- **Processing** — one shared `summarizeMeeting()` produces Markdown summaries (6 templates)
  and action items through any OpenAI-compatible endpoint.
- **Review** — transcript player synced to audio (or a transcript-only clock when no audio is
  attached), summary tabs, action-item toggles, keyboard deep links (`?t=`, `?template=`).
- **Sharing** — select a range in a meeting, save a highlight, flip it public and send
  `/clip/<slug>`: no login needed to watch it.
- **Search** — titles, transcript text and summaries, debounced, with hits deep-linking to the
  exact second.
- **Calendar** — provider connect is an honest **stub** (no OAuth credentials in this
  environment); the connection flag persists on your account.

## Run locally

```bash
npm install
cp .env.example .env.local   # set LLM_API_KEY (optional — there is a deterministic fallback)
npm run db:reset             # create an empty ./data/fathom.db
npm run dev                  # http://localhost:3000
```

Optional, only if you want recordings transcribed without deploying:

```bash
./ops/install-stt.sh                       # python venv + faster-whisper model (~200 MB)
echo "STT_BIN=/srv/fathom/stt/bin/python" >> .env.local
```

Open the app, create an account at `/signup`, then add your first meeting at `/ingest`.

## Environment

| variable | purpose |
|---|---|
| `LLM_API_KEY`, `LLM_API_BASE`, `LLM_API_PATH`, `LLM_MODEL`, `LLM_INTEGRATION_ID` | shared summarizer (`src/lib/summarize.ts`) |
| `DATABASE_PATH`, `UPLOAD_DIR` | SQLite file and stored recordings |
| `RESEND_API_KEY` | outgoing mail — verification + password-reset links |
| `EMAIL_FROM` | sender (default `onboarding@resend.dev`, which only reaches the Resend account's own address) |
| `APP_URL` | canonical origin used inside emailed links (must be the HTTPS URL) |
| `STT_BIN`, `STT_SCRIPT`, `STT_MODEL` | local transcription (defaults: `/srv/fathom/stt/...`, `base.en`) |
| `COOKIE_SECURE` | force `Secure` cookies; otherwise decided per request from `X-Forwarded-Proto` |

`.env.local` is gitignored; production values live in `/etc/fathom/fathom.env`.

## Deploy

```bash
./scripts/deploy.sh              # typecheck → build → local smoke test → ship → health check
./scripts/deploy.sh --fresh-db   # also overwrite the live database with the local one
```

Flock-protected, keeps the previous release and rolls back automatically. Production layout:
Cloudflare (TLS) → nginx :80 → systemd `fathom` (port 3100) → `/srv/fathom/current`, SQLite and
audio uploads in `/srv/fathom/data/`, the transcription venv in `/srv/fathom/stt/`.

## Test

```bash
./scripts/smoke.sh                                     # 114 black-box checks against the live site
./scripts/smoke.sh http://127.0.0.1:3100               # …or any other deployment
SMOKE_STT_WAV=/path/to/speech.wav ./scripts/smoke.sh   # + assert on-box transcription
```

The suite signs up two throwaway accounts, exercises signup/login/logout, isolation between
accounts, ingest (transcript, audio, video), range-served audio, highlights and public clips,
action items, search, calendar, email-link endpoints, change password, delete account and the
credential rate limiter — then deletes both accounts. It exits non-zero on any failure.
`./scripts/deploy.sh --smoke` runs it right after a deploy.

## Operate

| task | how |
|---|---|
| health | `curl https://tests.thetrillioniar.me/api/health` — counts, LLM/STT/mail status |
| logs | `journalctl -u fathom -f` |
| restart | `sudo systemctl restart fathom` |
| rollback | redeploy the previous release (`/srv/fathom/releases/`, `.previous` symlink) |
| backups | `/srv/fathom/ops/backup.sh` daily at 03:17 via `/etc/cron.d/fathom-backup` → `/srv/fathom/backups` (DB snapshot + uploads, 7 days kept) |
| restore | `sudo systemctl stop fathom`, `gunzip -c backups/fathom-<stamp>.db.gz > data/fathom.db`, unpack `uploads-<stamp>.tgz` into `data/`, `sudo systemctl start fathom` |

The service runs hardened (`NoNewPrivileges`, `PrivateTmp`, `ProtectHome`, `ProtectSystem=full`)
and can only write under `/srv/fathom` and `/tmp`; the whisper model cache lives in
`/srv/fathom/stt/hf-cache` (`HF_HOME`).

## Docs

- `SCHEMA.md` — tables, constraints, how data enters the system
- `ARCHITECTURE.md` — stack, auth, capture pipeline, deploy, route ownership map
- `.agent-logs/` — session-by-session build log
