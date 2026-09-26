# Fathom — AI meeting notetaker

Self-hosted meeting notes with **real accounts**: sign up, record or import a meeting, and get
LLM summaries, action items, transcript search, highlights and shareable public clip links.

**Live:** http://51.170.90.41/ · **Repo:** https://github.com/Abdulhadi446/fathom-clone

## What it does

- **Accounts** — email + password (scrypt-hashed), server-side sessions in an `HttpOnly`
  cookie, every row scoped to the account that created it.
- **Capture** — `/ingest` accepts pasted text, a `.txt`/`.vtt`/`.srt` upload, or a live
  microphone recording (browser speech recognition + `MediaRecorder` audio upload).
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

Open the app, create an account at `/signup`, then add your first meeting at `/ingest`.

## Deploy

```bash
./scripts/deploy.sh              # typecheck → build → local smoke test → ship → health check
./scripts/deploy.sh --fresh-db   # also overwrite the live database with the local one
```

Flock-protected, keeps the previous release and rolls back automatically. Production layout:
nginx :80 → systemd `fathom` (port 3100) → `/srv/fathom/current`, SQLite and audio uploads in
`srv/fathom/data/`.

## Docs

- `SCHEMA.md` — tables, constraints, how data enters the system
- `ARCHITECTURE.md` — stack, auth, deploy, route ownership map
- `.agent-logs/` — session-by-session build log
