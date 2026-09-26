# ARCHITECTURE

A Fathom-style AI meeting notetaker with **real accounts**: sign up → record or import a
meeting → LLM summaries/templates → action items → playback sync → highlights → public clip
sharing → search. There is no seed data and no demo user: every row belongs to the account
that created it.

**Live URL:** `http://51.170.90.41/`
**Repo:** public GitHub repo created from this directory (see `.agent-logs/` for the session trail).

---

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind 4** — `src/app/*`
- **SQLite + Drizzle ORM + better-sqlite3** — `src/db/*`, single file DB, WAL mode
- **LLM:** any OpenAI-compatible endpoint, defaulting to the GitHub Copilot gateway
  (`src/lib/llm.ts`, config via env — no key is ever committed)
- **Deploy target:** a VM behind nginx (no Vercel/PaaS token was available in this
  environment, so the app ships as a Next.js *standalone* bundle to a host we control).

## Repo structure

```
src/
  app/                  routes (App Router) — see ownership map below
    api/                foundation-owned HTTP endpoints
    middleware.ts        route gate (edge) — cookie presence check
  db/
    schema.ts           Drizzle schema (lead-owned)
    index.ts            connection + DDL + column migrations (lead-owned)
  lib/
    llm.ts              low-level chat client (chat, chatJSON, parseJsonLoose)
    summarize.ts        ★ THE summarization function (shared)
    auth.ts             scrypt hashing, sessions, requireUser, rate limits
    auth-http.ts        JSON error helpers + withUser() for API routes
    session-cookie.ts   cookie name + public-path rules (edge-safe)
    uploads.ts          audio storage (UPLOAD_DIR) + path resolution
    queries.ts          shared read helpers — all scoped to a userId
    format.ts           shared formatting helpers
    load-env.ts         .env loader for scripts
  types/                ambient d.ts
scripts/
  new-db.ts             create/empty the local database (npm run db:reset)
  deploy.sh             build → ship → health check → rollback
ops/                    systemd unit, nginx site, local STT (install-stt.sh, stt/transcribe.py)
data/fathom.db          local SQLite (gitignored)
data/uploads/           local audio uploads (gitignored)
.agent-logs/            agent session log — committed as we go
```

## Run locally

```bash
npm install
cp .env.example .env.local      # add LLM_API_KEY for real summaries (optional)
npm run db:reset                # create an empty ./data/fathom.db (schema only)
npm run dev                     # http://localhost:3000
```

Open `http://localhost:3000` → you are redirected to `/login` → create the first account at
`/signup`. There is nothing to seed: the dashboard is empty until you add a meeting.

Without `LLM_API_KEY` ingest still works — `summarizeMeeting()` falls back to a deterministic
summarizer so no screen is ever empty.

## Deploy

```bash
./scripts/deploy.sh              # typecheck → build → local smoke test → ship → remote health check
./scripts/deploy.sh --fresh-db   # also overwrite the live DB with the local one
```

The script is **safe to run concurrently** (flock), keeps the previous release for
automatic rollback, and never replaces the live SQLite file unless the server has none yet
or you pass `--fresh-db`. Server layout:

```
/srv/fathom/current      → symlink to the live release (standalone Next server, port 3100)
/srv/fathom/data/        → persistent SQLite + uploads/ (survives deploys)
/srv/fathom/stt/         → python venv + faster-whisper model + transcribe.py (ops/install-stt.sh)
/etc/fathom/fathom.env   → LLM_* + DATABASE_PATH + UPLOAD_DIR + RESEND_API_KEY + APP_URL
                            + EMAIL_FROM + STT_* (secret, not in git)
/etc/nginx/sites-enabled/fathom → reverse proxy on :80 (forwards X-Forwarded-Proto/Host)
```

TLS terminates at Cloudflare in front of the box; nginx trusts the forwarded
`X-Forwarded-Proto`/`X-Forwarded-Host` so redirects stay on `https://` and the session cookie
can be marked `Secure`. Email needs `RESEND_API_KEY` + `APP_URL`; transcription needs
`/srv/fathom/stt` to exist — both are checked at deploy time.

## ★ The summarization function

```ts
import { summarizeMeeting, TEMPLATES, type TemplateId } from "@/lib/summarize";

const result = await summarizeMeeting(
  {
    title, startedAt, durationSeconds, participants,
    segments: [{ speaker, text, startTime, endTime }],   // seconds
  },
  "sales-call",                                          // any TEMPLATES[].id
);
// { template, content /* Markdown */, actionItems: string[], source: "llm" | "fallback" }
```

- **Owner: foundation.** Call it, don't fork it. It retries once when the model returns no
  action items and degrades to a deterministic fallback on any LLM error.
- Templates: `standard`, `sales-call`, `standup`, `interview`, `decisions`, `exec-brief`.
- `src/lib/llm.ts` (`chat` / `chatJSON`) is the transport — also shared, don't fork it.
- In the browser/server boundary: only import this from **server** code (route handlers,
  server components, scripts).

## Auth & access control

Real email+password auth, no third-party identity provider, no extra dependencies:

| piece | file | what it does |
|---|---|---|
| password | `src/lib/auth.ts` | `crypto.scrypt` (N=16384, r=8, p=1) with a per-user salt, stored as `scrypt$N$r$p$salt$hash`; compared with `timingSafeEqual` |
| session | `src/lib/auth.ts` | 256-bit random token in an `HttpOnly` cookie; only `sha256(token)` is stored in `Session`; 30-day expiry, slid on activity |
| gate | `src/middleware.ts` | edge middleware: paths outside the public allowlist need the cookie, otherwise → `/login` (API → 401) |
| enforcement | `getSessionUser()` / `requireUser()` | every server page and API handler re-validates the token against the database — a forged cookie never gets past this |
| ownership | `src/lib/queries.ts` | `getOwnedMeeting(id, userId)`, `listMeetings(userId)`, `searchAll(userId, …)` … meetings are never readable across accounts |
| limits | `src/lib/auth.ts` `rateLimit()` | in-process counter on credential endpoints (10/min per IP and per email/address) |
| email | `src/lib/mailer.ts` | Resend HTTP API (`RESEND_API_KEY`), sender `EMAIL_FROM` (default: Resend's `onboarding@resend.dev`), links built from `APP_URL` |
| tokens | `src/lib/tokens.ts` | single-use `AuthToken` rows for **email confirmation** (2 days) and **password reset** (1 hour); only `sha256(token)` is stored, and the row is burned on first use |
| transcription | `src/lib/stt.ts` → `ops/stt/transcribe.py` | local faster-whisper (`/srv/fathom/stt`, `ops/install-stt.sh`); serialised, 10-minute timeout, no API key and no cloud STT |
| account safety | `src/app/api/account` | `DELETE` with a password check: user row (cascades) + stored recordings + every session |

**Public by design:** `/login`, `/signup`, `/verify-email`, `/forgot-password`,
`/reset-password`, `/api/auth/*`, `/api/health`, `/api/audio/[id]` (only when the meeting has a
public highlight) and `/clip/<slug>`. Everything else needs a session; `/clip/<slug>` is the
sharing surface — create a highlight, flip `isPublic`, hand out the link.

### Capture → transcript → summary

```
paste / .txt|.vtt|.srt upload ─┐
mic recording   (MediaRecorder)├─► POST /api/ingest ─► parseTranscript ─┐
screen recording (MediaRecorder)┘        │                              │
                                         └─ no pasted text?             │
                                              src/lib/stt.ts            │
                                              (faster-whisper, on-box) ─┘
                                                                        ▼
                                       summarizeMeeting(standard + exec-brief)
```

A pasted transcript always wins over transcription; if transcription fails the browser's live
captions are used as a last resort, otherwise the request answers `422` and nothing is stored.

## Data access

`src/lib/queries.ts` gives every caller the same reads — **all of them take a `userId`**:
`listMeetings(userId)`, `getOwnedMeeting(id, userId)`, `listMeetingsWithSnippet(userId)`,
`searchAll(userId, query)`, `getDashboardStats(userId)`, plus the meeting-scoped reads
(`getSegments`, `getSummaries`, `getActionItems`, `getHighlights`) that you may only call
after an ownership check. `getMeeting(id)` and `getHighlightBySlug(slug)` are the two
unscoped reads, reserved for the public clip path.

---

## Route ownership map (final — all phases merged)

Ownership was exclusive during the build and is kept as the maintenance map: change files
only inside your area, and coordinate through the lead before touching a frozen file.

| Route / file | Owner | Notes |
|---|---|---|
| `src/db/schema.ts`, `src/db/index.ts` | **foundation (frozen)** | need a field? → flag the lead |
| `src/lib/llm.ts`, `src/lib/summarize.ts`, `src/lib/transcript.ts` | **foundation (frozen)** | call, don't modify |
| `src/lib/queries.ts`, `src/lib/format.ts` | foundation (read-mostly) | additive changes only, coordinate first |
| `src/app/api/health`, `src/app/api/meetings` | foundation | `GET /api/meetings` supports `?q=` + `?limit=` |
| `src/app/layout.tsx`, `src/components/Nav.tsx`, `src/app/globals.css` | **foundation (frozen)** | the app shell every page renders inside |
| `src/components/highlights/HighlightBar.tsx` | **agent C** (contract set by lead) | A renders it in `/meetings/[id]` passing `{meetingId, durationSeconds, currentTime, selection, onSeek?}` |
| `scripts/deploy.sh`, `ops/*`, `scripts/new-db.ts` | foundation | everyone runs them, nobody edits them mid-run |
| `src/app/page.tsx`, `src/app/meetings/page.tsx`, `src/app/search/**`, `src/app/api/search/**` | **agent B** | dashboard, meetings table, cross-meeting search |
| `src/components/dashboard/**` | **agent B** | `MeetingTable`, `MeetingRow`, `SearchBox`, `SearchResults`, `StatsStrip`, `HighlightMatch`, `hits.ts` |
| `src/app/meetings/[id]/**`, `src/app/api/meetings/[id]/**` | **agent A** | transcript player, summary tabs, action items (`PATCH …/action-items`) |
| `src/components/meeting/**` | **agent A** | `MeetingView`, `Transcript`, `SummaryPanel`, `ActionItems`, `ScrubBar`, `Markdown`, `formatClock`, `speakerColors` |
| `src/app/clip/[slug]/**`, `src/app/api/highlights/**` | **agent C** | highlight capture, share toggle, public clip page |
| `src/components/highlights/**`, `src/components/clip/**` | **agent C** | `HighlightBar`, `ClipPlayer`, `ClipTranscript`, `CopyLinkButton` |
| `src/app/calendar/**`, `src/app/api/calendar/**` | **agent D** | calendar-provider stub (persists to `User.calendar_*`) |
| `src/middleware.ts`, `src/lib/session-cookie.ts`, `src/lib/auth*.ts` | **lead** | auth: sessions, gating, rate limits |
| `src/app/api/auth/**`, `src/app/login`, `src/app/signup`, `src/components/auth/**` | **lead** | sign-up / sign-in / sign-out, verification, password reset |
| `src/app/settings/**`, `src/app/api/account/**`, `src/components/account/**` | **lead** | change password, delete account |
| `src/app/verify-email/**`, `src/app/forgot-password/**`, `src/app/reset-password/**` | **lead** | emailed-link landing pages |
| `src/lib/mailer.ts`, `src/lib/tokens.ts`, `src/lib/stt.ts`, `ops/stt/**` | **lead** | email, single-use tokens, local transcription |
| `src/app/api/audio/[id]/**`, `src/lib/uploads.ts` | **lead** | audio storage + Range serving |
| `src/app/api/ingest/**`, `src/components/ingest/**` | **agent D** (+ lead) | paste/upload/record → `summarizeMeeting()` |
| `src/app/ingest/**`, `src/app/api/ingest/**` | **agent D** | paste/upload → real `summarizeMeeting()` → new meeting |
| `src/components/calendar/**`, `src/components/ingest/**` | **agent D** | `CalendarConnect`, `ProviderMark`, `IngestForm`, `sample.ts` |

### Cross-cutting contracts

| Contract | From → to | Shape |
|---|---|---|
| Deep link with a timestamp | B → A | search hits link to `/meetings/[id]?t=<int seconds>`; A seeks the player on load |
| Template deep link | B → A | `/meetings/[id]?template=<key>` pre-selects the summary tab |
| Seek event | A ↔ C | `HighlightBar.onSeek(seconds)` plus `window.dispatchEvent(new CustomEvent("fathom:seek", {detail: seconds}))` |
| Highlight capture | A → C | A owns selection state and renders `<HighlightBar>`; C owns create/share/delete and the `/api/highlights` routes |
| Shared reads | lead → all | `src/lib/queries.ts` (`listMeetingsWithSnippet`, `searchAll`, `getHighlightBySlug`, …) |

Shared UI conventions: dark, dense, neutral palette (Tailwind 4, no UI library).

---

## Parallel build (Phase 2 — complete, kept for reference)

> **Status: done.** All four branches (`agent-a`…`agent-d`) were merged into `master`,
> rebuilt and deployed. The worktrees below are historical — new work happens
> in the main checkout on `master`.

Four agents worked at the same time. Each one had an isolated **git worktree** on its own
branch so nobody's edits collided:

| agent | worktree | branch | dev port |
|---|---|---|---|
| A meeting detail | `/home/abdulhadi/Projects/fathom-worktrees/agent-a` | `agent-a` | 3001 |
| B dashboard/search | `/home/abdulhadi/Projects/fathom-worktrees/agent-b` | `agent-b` | 3002 |
| C sharing/highlights | `/home/abdulhadi/Projects/fathom-worktrees/agent-c` | `agent-c` | 3003 |
| D stubs/ingest | `/home/abdulhadi/Projects/fathom-worktrees/agent-d` | `agent-d` | 3004 |

- `node_modules` must be a *hardlink copy* of the main checkout (`rm node_modules && cp -al
  /home/abdulhadi/Projects/project/node_modules node_modules`) — a symlink breaks the
  standalone build. **Do not add npm dependencies**
  (the registry here is extremely slow); if you think you need one, ask the lead.
- Each worktree had its own `data/fathom.db` (`npm run db:reset` created it; there is no seed data).
- Commit **only your own files** (`git add <paths>`, never `git add -A`), push your branch
  incrementally (`git push -u origin agent-<x>`), and append to `.agent-logs/`.
- `./scripts/deploy.sh` is flock-protected: builds + deploys from *your* worktree, smoke
  tests locally, health checks remotely and rolls back automatically. Deploys queue, so
  deploy at milestones, not after every edit.
