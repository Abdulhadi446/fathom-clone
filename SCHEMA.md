# SCHEMA

SQLite (via Drizzle ORM + better-sqlite3). Connection: `DATABASE_PATH` (default `./data/fathom.db`).
DDL lives in `src/db/index.ts` (plus a small `migrateColumns()` pass for columns added after a
table first existed); the type-safe schema in `src/db/schema.ts` is owned by the lead — see
ARCHITECTURE.md.

All ids are strings, prefixed by kind: `u_*` (users), `m_*` (meetings), `seg_*`, `sum_*`,
`act_*`, `hl_*` (highlights); `Session.id` is sha256-hex of the cookie token.
`*_at` columns are integer epoch-milliseconds (Drizzle `mode: "timestamp_ms"` → JS `Date`).
Booleans are SQLite integers 0/1 (Drizzle `mode: "boolean"`).

---

## User

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `name` | TEXT | NOT NULL | |
| `email` | TEXT | NOT NULL | UNIQUE — stored lower-cased |
| `password_hash` | TEXT | NOT NULL | `scrypt$N$r$p$saltB64$hashB64` — see `src/lib/auth.ts` |
| `calendar_provider` | TEXT | | `"google"` \| `"outlook"` \| NULL — written by the calendar-connect stub |
| `calendar_connected` | INTEGER (bool) | NOT NULL, default 0 | written by the calendar-connect stub |
| `created_at` | INTEGER (ms) | NOT NULL | `$defaultFn(() => new Date())` |

## Meeting

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `title` | TEXT | NOT NULL | |
| `started_at` | INTEGER (ms) | NOT NULL | indexed (`Meeting_started_at_idx`) |
| `duration_seconds` | INTEGER | NOT NULL | |
| `participants` | TEXT (json) | NOT NULL | JSON array of display names, e.g. `["Priya Raman","Marcus Hale"]` |
| `source` | TEXT | NOT NULL, default `"recorded"` | `"recorded"` (recorded in the browser, audio attached) \| `"transcript"` (pasted/uploaded transcript) |
| `audio_path` | TEXT | | filename inside `UPLOAD_DIR`, e.g. `m_abc123.webm`; NULL = no audio |
| `user_id` | TEXT | NOT NULL, FK → `User.id` ON DELETE CASCADE | owner — every read is filtered by it |

## TranscriptSegment

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `meeting_id` | TEXT | NOT NULL, FK → `Meeting.id` ON DELETE CASCADE | indexed with `start_time` |
| `speaker` | TEXT | NOT NULL | display name of the speaker |
| `start_time` | REAL | NOT | **seconds** from meeting start |
| `end_time` | REAL | NOT | **seconds** from meeting start |
| `text` | TEXT | NOT NULL | one spoken utterance per row |

Rows for a meeting are always read in `start_time` order.

## Summary

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `meeting_id` | TEXT | NOT NULL, FK → `Meeting.id` ON DELETE CASCADE | |
| `template` | TEXT | NOT NULL | one of `standard`, `sales-call`, `standup`, `interview`, `decisions`, `exec-brief` (see `src/lib/summarize.ts`) |
| `content` | TEXT | NOT NULL | **Markdown** produced by `summarizeMeeting()` |
| `created_at` | INTEGER (ms) | NOT NULL | |
| | | UNIQUE (`meeting_id`, `template`) | one row per template per meeting |

## ActionItem

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `meeting_id` | TEXT | NOT NULL, FK → `Meeting.id` ON DELETE CASCADE | |
| `text` | TEXT | NOT NULL | imperative follow-up sentence |
| `done` | INTEGER (bool) | NOT NULL, default 0 | toggled by the meeting-detail UI |
| `sort_order` | INTEGER | NOT NULL, default 0 | read order |
| `created_at` | INTEGER (ms) | NOT NULL | |

## Highlight

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `meeting_id` | TEXT | NOT NULL, FK → `Meeting.id` ON DELETE CASCADE | |
| `start_time` | REAL | NOT | seconds |
| `end_time` | REAL | NOT | seconds |
| `note` | TEXT | | free-text caption |
| `share_slug` | TEXT | UNIQUE | public clip slug → `/clip/[share_slug]`; NULL = not shared |
| `is_public` | INTEGER (bool) | NOT NULL, default 0 | public clip pages only render rows where this is 1 |
| `created_at` | INTEGER (ms) | NOT NULL | |

---

## Session

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | **sha256 of the cookie token** — the raw token never touches the database |
| `user_id` | TEXT | NOT NULL, FK → `User.id` ON DELETE CASCADE | indexed (`Session_user_idx`) |
| `created_at` | INTEGER (ms) | NOT NULL | |
| `expires_at` | INTEGER (ms) | NOT NULL | 30 days out, slid forward while the user stays active |

Cookie `fathom_session`: 256 random bits, `HttpOnly`, `SameSite=Lax`, `Secure` in production.
Deleting a `User` cascades to their `Session` rows and their `Meeting` rows (which cascade on to
transcripts, summaries, action items and highlights).

---

## How data enters the system

There is **no seed data** — an empty database is a correct, shippable state. The only writers:

1. `POST /api/auth/signup` → `User` + `Session`
2. `POST /api/ingest` → `Meeting` + `TranscriptSegment`, then `Summary` (`standard`,
   `exec-brief`) + `ActionItem` rows through the shared `summarizeMeeting()`. Input can be
   pasted text, an uploaded `.txt`/`.vtt`/`.srt` file, or a browser recording (live speech
   recognition + `MediaRecorder` upload). `Meeting.source` is `recorded` when an audio file
   was attached, otherwise `transcript`.
3. `POST /api/highlights` → `Highlight`; `PATCH /api/highlights/[id]` with
   `{isPublic: true}` mints `share_slug`
4. `PATCH /api/meetings/[id]/action-items` → flips `ActionItem.done`
5. `POST /api/calendar` → `User.calendar_provider` / `calendar_connected` (stub)

Audio blobs go to `UPLOAD_DIR` (`./data/uploads` locally, `/srv/fathom/data/uploads` in
production) as `<meetingId>.<ext>` and are served by `GET /api/audio/[id]` with HTTP Range.

```bash
npm run db:reset            # apply the schema to ./data/fathom.db (creates it if missing)
npm run db:reset -- --empty # delete the file first — start from nothing
```
