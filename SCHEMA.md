# SCHEMA

SQLite (via Drizzle ORM + better-sqlite3). Connection: `DATABASE_PATH` (default `./data/fathom.db`).
DDL lives in `src/db/index.ts`, the type-safe schema in `src/db/schema.ts` (**frozen** — see ARCHITECTURE.md).

All ids are strings (prefixed, deterministic for seed data: `m_*`, `seg_*`, `sum_*`, `act_*`, `hl_*`).
`*_at` columns are integer epoch-milliseconds (Drizzle `mode: "timestamp_ms"` → JS `Date`).
Booleans are SQLite integers 0/1 (Drizzle `mode: "boolean"`).

---

## User

| column | type | constraints | notes |
|---|---|---|---|
| `id` | TEXT | PK | |
| `name` | TEXT | NOT NULL | |
| `email` | TEXT | NOT NULL | UNIQUE |
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
| `source` | TEXT | NOT NULL, default `"recorded"` | `"recorded"` (seed) \| `"demo"` (demo-mode ingest) |
| `user_id` | TEXT | FK → `User.id`, ON DELETE SET NULL | |

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

## Seed data (`npm run seed`)

8 meetings, 1162 transcript segments, 22 summaries (6 templates), 32 action items, 13 highlights.
The 8-participant, 60-minute **Q3 Product Council — Roadmap Lock** carries 278 transcript segments.
Public highlights already exist: `acme-crm-pain`, `q4-roadmap-lock`, `northwind-sso-gate`.

Generated artifacts committed to the repo so seeding is reproducible without an LLM key:

- `seed-cache/<meetingId>.json` — LLM-generated transcript + summaries (regenerated when the prompt version changes or with `npm run seed:refresh`)
- `public/audio/<meetingId>.m4a` — **silent** AAC audio matching each meeting's duration (the capture layer is stubbed; the player's clock is real)

Commands:

```bash
npm run seed          # idempotent: upserts the 8 seeded meetings, never touches other rows
npm run seed:refresh  # ignores the transcript/summary cache and re-asks the LLM
npm run db:reset      # wipes every table, then seeds
```
