# 007 — lead — Phase 4: real accounts, no seed data

Scope change requested by the user after Phase 3: **remove the seeded data, add a real
login/account system, make everything real.**

Decisions taken (and why):

| ask | delivered | constraint that shaped it |
|---|---|---|
| real login | email + password, scrypt, DB sessions | the box has **only** LLM credentials — no SMTP, no Google OAuth client, so magic link / "Sign in with Google" cannot work here |
| remove seed data | seed script, `seed-cache/`, silent `public/audio/*.m4a`, `src/lib/transcript.ts` all deleted; live DB wiped | an empty database is a valid, shippable state |
| real capture | paste / `.txt`-`.vtt`-`.srt` upload / in-browser microphone recording | no speech-to-text API key → transcription uses the browser's Web Speech API (free, Chrome/Edge), audio via `MediaRecorder` uploaded next to the transcript |
| public clip links | kept public | sharing is the product surface; creating one still needs a session |

## Schema (lead-owned change)

- `User.password_hash` (NOT NULL on new DBs, `ALTER TABLE` migration for existing ones).
- New `Session` table — PK is `sha256(cookie token)`, so a database leak does not hand over
  live sessions. FK cascade from `User`.
- `Meeting.user_id` is now **NOT NULL** + `ON DELETE CASCADE` (owner), `Meeting.audio_path`
  stores the uploaded filename in `UPLOAD_DIR`.
- `Meeting.source` values: `recorded` (audio attached) / `transcript` (pasted or uploaded).
- `src/db/index.ts` gained `migrateColumns()` — `CREATE TABLE IF NOT EXISTS` never alters an
  existing table, so columns added later are applied with `ALTER TABLE`.

## Auth implementation

- `src/lib/auth.ts` — `hashPassword`/`verifyPassword` (`crypto.scrypt`, N=16384 r=8 p=1,
  `timingSafeEqual`), `createSession`/`getSessionUser`/`destroySession` (sliding 30-day
  expiry), `requireUser`, plus an in-process `rateLimit()` for signup/login (10/min per IP
  and per email).
- `src/app/api/auth/{signup,login,logout,me}` — JSON endpoints; login always returns the same
  "Email or password is incorrect" message so the response cannot be used to enumerate
  accounts.
- `/signup`, `/login` pages + `src/components/auth/AuthForm.tsx` (client), `?next=` honoured
  after sign-in and restricted to same-site paths.
- `src/middleware.ts` (edge) — cookie-presence gate for every route outside the public
  allowlist (`/login`, `/signup`, `/clip/`, `/api/auth/`, `/api/health`, `/api/audio/`).
  It deliberately does **not** validate the token: every page and API handler re-validates
  it against SQLite in `src/lib/auth.ts`, so a forged cookie never gets past the handler.
- `src/lib/session-cookie.ts` — dependency-free cookie name + allowlist so middleware can
  import it without dragging `node:crypto` into the edge bundle.

## Scoping (every read is owner-filtered)

`listMeetings(userId)`, `listMeetingsWithSnippet(userId)`, `searchAll(userId, …)`,
`getDashboardStats(userId)`, `listMeetingExtras(userId)`, and a new
`getOwnedMeeting(id, userId)` that returns `null` for someone else's meeting. `getMeeting(id)`
and `getHighlightBySlug(slug)` stay unscoped for the public clip page only. API routes use
`withUser()` from `src/lib/auth-http.ts`, which turns a missing/invalid session into a 401.

Verified behaviour (local, then live): a second account sees `{"meetings":[],count:0}`,
gets **404** on the foreign meeting page, **404** on foreign action-item PATCH, highlight
GET/PATCH/DELETE, while the owner still gets 200/201.

## Capture → processing

- `/ingest` now has two tabs (`CaptureTabs.tsx`): **Paste or upload** (existing form, cleaned
  of seed-era copy) and **Record** (`Recorder.tsx`).
- `Recorder.tsx` runs `SpeechRecognition` (continuous, restarts itself after pauses) plus
  `MediaRecorder`; on stop it writes `[m:ss] Name: text` lines and POSTs `multipart/form-data`
  with the audio blob to `/api/ingest`.
- `/api/ingest` accepts JSON *and* multipart, saves audio to `UPLOAD_DIR` as
  `<meetingId>.<ext>`, sets `source = "recorded" | "transcript"`, and rolls the file back if
  the insert fails. Summaries still come from the shared `summarizeMeeting()`.
- `GET /api/audio/[id]` serves audio with **HTTP Range** (206 + `Content-Range`) so the player
  seeks; access = owner's session, or anyone when the meeting has a public highlight (that is
  what makes a shared clip playable).
- Meeting view and clip player were re-pointed from the deleted `/audio/*.m4a` stubs:
  without audio they run the existing transcript clock and say so ("No audio attached"
  instead of "simulated recording").

## Two real bugs found on the live box

1. **`Secure` cookie over plain HTTP.** `secure: NODE_ENV === "production"` made Chrome and
   curl drop the session cookie, so every authenticated request 401'd. Now driven by
   `COOKIE_SECURE=1` (unset here) and documented for when TLS lands.
2. **Redirect to `localhost:3100`.** Behind nginx the app sees `127.0.0.1:3100`, and
   `NextResponse.redirect(nextUrl)` produced an absolute Location pointing at it. Middleware
   now emits a **relative** `Location: /login?next=…`, and nginx forwards
   `X-Forwarded-Host`.
   Found by a live `curl -I` — both would have been invisible to a local-only test.

Also fixed: `deploy.sh` probed `/login` *after* killing the smoke server (self-inflicted
failure), and its final `/api/meetings` verification now 401s by design — both corrected.
`client_max_body_size` raised 20m → 100m for audio uploads, and the nginx site is now
refreshed on every deploy instead of only on first install.

## Environment fix

`.env.local` had a bare `DATABASE_PATH=` line. An empty string is not `nullish`, so the
`??` fallback never fired and better-sqlite3 opened a **throwaway temporary database** —
in dev, two module instances of `src/db` could then disagree (that is why sign-in appeared
to work and still redirected to `/login`). `src/lib/db-path.ts` now treats a blank value as
unset, and the env line is explicit.

## State

- `npm run db:reset -- --empty` → local DB: `users=0, meetings=0, sessions=0`.
- tsc + eslint clean; live deploy green; health returns all-zero counts.
- Docs rewritten: README (project-level), SCHEMA (User/Session/audio + "How data enters the
  system"), ARCHITECTURE (auth table, scoped data access, updated route map).
