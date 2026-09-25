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

(to be filled as they land)

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
