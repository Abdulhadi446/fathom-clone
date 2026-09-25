# 003 · Agent B · Dashboard + cross-meeting search

Worktree `/home/abdulhadi/Projects/fathom-worktrees/agent-b`, branch `agent-b`.
Dev server: `npx next dev -p 3002` (webpack — see "Problems" below).

## Scope owned

| file | route |
|---|---|
| `src/app/page.tsx` | `/` — dashboard |
| `src/app/search/page.tsx` | `/search?q=` — server-rendered search page |
| `src/app/api/search/route.ts` | `GET /api/search?q=&limit=` |
| `src/components/dashboard/**` | all dashboard/search UI |
| `src/lib/queries.ts` | **append-only** helpers (see below) |

## Built

### Dashboard `/` (server-rendered, no JS needed for first paint)

- Stats strip computed server-side: Meetings (8), This week (4), Recorded (5h 5m),
  Open actions (32), Highlights (13) — `getDashboardStats()`.
- One row per meeting: relative day + time (`relativeDay()`), title, inferred type badge
  (`sales-call`→Sales, `interview`→Interview, `standup`→Standup, `decisions`→Planning,
  else Internal — from which `Summary` templates exist), `demo` badge for `source:"demo"`,
  2-line summary snippet (`listMeetingsWithSnippet().snippet`), initials avatar stack
  (max 4 + overflow), duration, transcript-line count, highlight count, open/total action
  items. Whole row links to `/meetings/[id]`.
- Sort control (server-side via `?sort=`): Newest (default) / Oldest / Longest / People —
  all render without JS.

### Search

- `GET /api/search?q=roadmap&limit=30` → `{query, count, hits[]}`; each hit carries
  `kind` (`meeting` | `transcript` | `summary`), meeting title/date, excerpt and an
  `href` computed by `hitHref()`:
  - transcript hit → **`/meetings/[id]?t=<floor(startTime)>`** (seconds, not ms —
    **convention documented here, not in ARCHITECTURE.md**; agent A should seek the
    player to that timestamp when `?t=` is present),
  - meeting/summary hit → `/meetings/[id]`.
  Query < 2 chars → `{count: 0, hits: []}`. `limit` clamped to 1..60 (default 60).
- `SearchBox` (client): 300 ms debounce + monotonically-increasing request sequence so
  out-of-order responses are dropped; dropdown grouped under Meeting / Transcript /
  Summary headers with counts; `<mark>` highlighting of the query inside the excerpt;
  keyboard = ⌘K/Ctrl-K focus, ↑/↓ cycle, ↵ opens active hit (top hit by default),
  Esc closes, blur closes; "View all results" footer → `/search?q=`; combobox/listbox
  ARIA with `aria-activedescendant`.
- `/search?q=` server page: same `searchAll()` behind the same rendering, grouped
  sections with badges + timestamp chips for transcript hits, suggestion chips
  (roadmap, blocker, budget, SSO, renewal, onboarding) for empty/short/0-hit queries.

### Additive helpers appended to `src/lib/queries.ts` (end of file, existing exports untouched)

- `getDashboardStats()` — totals for the stats strip.
- `listMeetingExtras()` — per meeting: summary templates + action-item counts.

## Verification (local, dev server on :3002)

- `npx tsc --noEmit` clean; `npm run lint` clean (only pre-existing warning in
  `src/components/highlights/HighlightBar.tsx`, agent C's file).
- `/` → 200, all **8 seeded meeting links** present in the server-rendered HTML,
  stats strip `8 / 4 / 5h 5m / 32 / 13`.
- `/api/search?q=roadmap` → **9 hits** (`meeting:1, transcript:6, summary:2`),
  `SSO` → 10, `blocker` → 5, `budget` → 3, `acme` → 4, `onboarding` → 5.
  Transcript hits deep-link e.g. `/meetings/m_q3_product_council?t=1324`.
- `/search?q=roadmap` → 200, 10 `<mark>` highlights, deep links present.
- `/?sort=longest` → council (3600 s) → interview (3300 s) → acme (2700 s).

## Commits

- `59b8427` — Dashboard at /: stats strip, meeting rows w/ type badges + sort;
  cross-meeting search (debounced box, /search, /api/search). Pushed to `origin/agent-b`.

## Deploys

1. **`rel-20260925-230310-63670` — FAILED, auto-rolled back.** Remote service could not
   start: `Cannot find module 'next'`. Cause: `.next/standalone/node_modules` was a
   **symlink** to `/home/abdulhadi/Projects/project/node_modules` (inherited from the
   worktree's symlinked `node_modules`; `copyTracedFiles` re-creates symlinks verbatim),
   so the release contained a dangling absolute symlink. Rollback verified the site still
   served 200 (`rolled back OK`) — live site was never down.
2. **`rel-20260925-230943-66655` — OK** (after the node_modules fix below).

### The worktree symlink fix (no shared file touched)

Replaced the worktree's `node_modules` symlink with a **hardlink copy** of the main
checkout's tree (same filesystem, ~0 extra disk, no npm/registry involved):

```bash
rm node_modules && cp -al /home/abdulhadi/Projects/project/node_modules node_modules
```

`next build` now emits a real `.next/standalone/node_modules` (20 traced packages,
79 MB) exactly like the lead's builds. **Agents A and C have the same symlinked
`node_modules` and will fail their first deploy the same way** — either do the same, or
have the lead de-reference the symlink in `deploy.sh` staging
(`cp -rL` / `cp --dereference`) which would fix it for everyone.

### Live verification (after deploy #2 above, i.e. the successful one)

- `curl http://51.170.90.41/` → **200**, 9 meeting rows in the server-rendered HTML
  (8 seeded + agent D's demo ingest), stats strip `9 / 5 / 5h 5m / 36 / 13`,
  sort links + search box present, type badges Sales/Interview/Standup/Planning/Internal.
- `/api/search?q=roadmap` → **9 hits**; `SSO` → 10, `blocker` → 5, `budget` → 3;
  transcript hits deep-link `/meetings/m_q3_product_council?t=1324` etc.
- `/search?q=roadmap` → 200, 10 `<mark>` highlights.
- `/api/health` → `{meetings: 9, transcriptSegments: 1167, summaries: 24,
  actionItems: 36, highlights: 13}`.


## Problems / for the lead

1. **`.env.local` shipped with `DATABASE_PATH=` (empty).** Next loads it before app code,
   so `process.env.DATABASE_PATH ?? default` resolves to `""` → better-sqlite3 opens a
   *temporary* DB → **every locally-served page is empty** (`/api/health` counts all 0).
   Seeding still works only because `scripts/seed.ts` uses static imports, so `src/db`
   initializes *before* `loadEnv()` runs. Fix in my worktree: set
   `DATABASE_PATH=./data/fathom.db`. `.env.example` should not contain an empty value —
   recommend the lead drop the line or document it.
2. **`npm run dev` (Turbopack) crashes in the worktrees**: "Symlink node_modules is
   invalid, it points out of the filesystem root". `npx next dev -p 3002` (webpack) works.
3. Deep-link contract for agent A: `/meetings/[id]?t=<seconds>` = seek transcript player
   to that start time (I floor to integer seconds).

## Slice 2 — `/meetings` table view + participant filter

- `99dbfbd` — `src/app/meetings/page.tsx` (owned per the ownership map) + new
  `src/components/dashboard/MeetingTable.tsx`:
  - dense table: Date (relative + clock), Meeting (title link + snippet), Participants
    (avatar stack + count), Type badge, Duration, Lines, Clips, open/total Actions.
  - `?sort=newest|oldest|longest|people|title` and `?person=<exact name>` filters,
    both server-side, no JS; sort is preserved when a person chip is picked and vice
    versa (`href()` helper builds the query string).
  - participant chips = every person in the data, sorted by meeting count, with counts.
  - dashboard header gained a "Table view" link → `/meetings`; table header has
    "Row view" → `/`.
  - compact `SearchBox size="sm"` on the page too.

## Deploy 3 (final)

- **`rel-20260925-231551-68582` — OK**, rolled out on top of the running site.

### Live verification (http://51.170.90.41/, 2026-09-25)

| check | result |
|---|---|
| `GET /` | **200**, 9 meeting rows server-rendered (8 seeded + agent D demo), stats `9 / 5 / 5h 5m / 36 / 13`, sort bar + "Table view" link + search box present |
| `GET /meetings` | **200**, 9 rows, 40 participant-filter chip hrefs |
| `GET /meetings?person=Priya%20Raman&sort=longest` | **200**, 5 rows (correct subset) |
| `GET /api/search?q=roadmap` | **9 hits**, first `/meetings/m_q3_product_council` |
| `GET /api/search?q=SSO` / `blocker` / `budget` | **10 / 5 / 3 hits**, transcript hits deep-link with `?t=` (`…&t=111`, `…&t=43`, `…&t=232`) |
| `GET /search?q=SSO` | **200**, 10 `<mark>` highlights, groups Meetings/Transcript/Summary |
| `GET /search` (no q) | 200 + suggestion chips (roadmap/blocker/budget/SSO/…) |
| `GET /api/search?q=` or `?q=a` | `{"count":0}` (searchAll's ≥2-char rule) |
| `GET /api/health` | `{meetings:9, transcriptSegments:1167, summaries:24, actionItems:36, highlights:13}` |
| `GET /meetings/m_q3_product_council` | 404 — agent A's route not merged yet (expected) |

Local gates: `npx tsc --noEmit` clean, `npm run lint` clean (only the pre-existing
warning in agent C's `HighlightBar.tsx`).

## Summary for the lead

- Everything in my ownership map is built, committed (`59b8427`, `379bbd9`, `99dbfbd`,
  plus this log entry) and pushed to `origin/agent-b`; three deploys, two green.
- **Needs the lead:** (a) `DATABASE_PATH=` empty in `.env.*.example` / fresh checkouts
  breaks local serving (empty DB) — see Problems #1; (b) agents A & C still have the
  symlinked `node_modules` that makes their first deploy fail with
  `Cannot find module 'next'` — my hardlink fix or a `cp --dereference` in `deploy.sh`
  fixes it for everyone; (c) `npm run dev` (Turbopack) panics in worktrees, use
  `npx next dev`.
- Contract for agent A: transcript deep links are **`/meetings/[id]?t=<seconds>`**
  (integer seconds from meeting start) — please seek the player to that offset.
