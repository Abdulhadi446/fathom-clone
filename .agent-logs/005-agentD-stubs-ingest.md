# 005 — agent D — calendar stub + demo-mode ingest

Scope (from the brief): `/calendar` (stubbed provider connect, persisted on the demo user
row), `/ingest` (paste a transcript → real `summarizeMeeting()` run), plus
`/api/calendar/**` and `/api/ingest/**`.

Ownership: `src/app/calendar/**`, `src/app/ingest/**`, `src/app/api/calendar/**`,
`src/app/api/ingest/**`, `src/components/calendar/**`, `src/components/ingest/**`,
plus append-only helpers in `src/lib/queries.ts`.

---

## 2026-09-25 — start

- Read `ARCHITECTURE.md` + `SCHEMA.md`. Frozen files untouched; I only import from
  `src/db/*` and call `summarizeMeeting()` from `src/lib/summarize.ts`.
- Worktree `agent-d` clean at `4bb4c0c`. Local `data/fathom.db` was missing, ran
  `npm run seed` → cache hit for all 8 meetings, no LLM calls
  (`{"meetings":8,"segments":1162,"summaries":22,"actionItems":32,"highlights":13}`).
  Required: `scripts/deploy.sh` refuses to ship without a local DB.
- Plan: ship in two deploys — (1) `/calendar` + `/api/calendar` as the first usable
  slice, (2) `/ingest` + `/api/ingest` as the finished feature.

## 2026-09-25 — slice 1: /calendar

Built:
- `src/app/calendar/page.tsx` — server component, `force-dynamic`, reads the demo user
  (`ensureDemoUser()`) so the connected state survives reloads.
- `src/components/calendar/CalendarConnect.tsx` — provider cards, the ~1.2 s simulated
  handshake ("Opening provider… / Requesting scopes… / Syncing next 30 days…"),
  connected state with "3 upcoming meetings detected (simulated)", disconnect.
- `src/components/calendar/ProviderMark.tsx` — inline-SVG Google Calendar / Outlook marks
  (no image or icon deps).
- `src/app/api/calendar/route.ts` — GET returns state, POST `{action:"connect"|"disconnect"}`
  writes `User.calendar_provider` / `User.calendar_connected` for `u_demo_alex`.
- `src/lib/queries.ts` — appended `DEMO_USER_ID` + `ensureDemoUser()` (additive only).
- Everything is labelled: "Demo" chips + explicit "stubbed, no real OAuth" copy.

Local: `npx tsc --noEmit` clean, `npm run lint` clean (only agent C's pre-existing
`HighlightBar` `_props` warning). Dev on :3004 (note: `npm run dev` uses `--turbopack`,
which panics on the worktree's symlinked `node_modules`; `npx next dev -p 3004` works).

### ⚠ Deploy problem (hit by every worktree agent, not just me)

First deploy (`rel-20260925-224217-57743`) **failed the remote health check and rolled
back automatically** — live site never went down (previous release kept serving):

```
Error: Cannot find module 'next'
  at /srv/fathom/releases/rel-.../server.js
```

Root cause: in a worktree `node_modules` is a *symlink* to
`/home/abdulhadi/Projects/project/node_modules`, so `next build` emits
`.next/standalone/node_modules` as that same **absolute symlink**. The local smoke test
passes (target exists on this machine), the tarball ships, and the symlink dangles on the
VM → `MODULE_NOT_FOUND`. The lead's deploys from the main checkout don't hit this because
`node_modules` there is a real directory (standalone = 79M, real dir).

Fix applied locally (no frozen file touched, no package installed):

```bash
rm node_modules
cp -al /home/abdulhadi/Projects/project/node_modules node_modules   # hard-link copy, 0 extra bytes
```

After that `.next/standalone/node_modules` is a real pruned dir (79M) and the deploy
succeeds. **Other worktree agents doing the same fix — see report to the lead.**

### Deploy 1 — `rel-20260925-224830-59579`

- Build includes `/calendar` + `/api/calendar`, local smoke OK, remote health OK.
- Verified live:
  - `curl http://51.170.90.41/calendar` → **200**, renders both provider cards + Demo chips.
  - `POST /api/calendar {"action":"connect","provider":"google"}` → `{"provider":"google","connected":true,…}`;
    re-`GET /calendar` server-renders "Connected" + "3 upcoming meetings detected (simulated)".
  - `disconnect` → back to `{"provider":null,"connected":false}` and the idle UI.

Commit: `04ddc44` "Calendar connect stub: Google/Outlook cards, simulated handshake,
persisted on demo user" (pushed to `origin/agent-d`).

## 2026-09-25 — slice 2: /ingest

Built:
- `src/app/api/ingest/parse.ts` — forgiving transcript parser. Recognises
  `00:03 Priya: …`, `1:02:03 Priya: …`, `[12:04] Priya: …` and bare `Priya: …`;
  anything else continues the previous speaker (falls back to speaker `Speaker`).
  Timestamped pastes keep their times; untimed pastes get synthetic times from a
  ~156 wpm estimate so the player still has a timeline. Skips blanks / `---`
  separators, caps at 600 segments, rejects empty/garbage/short pastes with clear
  messages (never a stack trace).
- `src/app/api/ingest/route.ts` — `POST /api/ingest`: validates (title required,
  ≤ 60k chars), parses, inserts `Meeting` (`source = "demo"`, `user_id = u_demo_alex`),
  `TranscriptSegment` rows, then runs **the shared `summarizeMeeting()`** in parallel
  for `standard` + `exec-brief`, inserts `Summary` rows, merges/dedupes 2–4
  `ActionItem` rows. Response reports per-template `source` (`llm` | `fallback`) and a
  `generator` field so the UI can say which ran. All errors are JSON `{error}` with a
  4xx/5xx status.
- `src/app/ingest/page.tsx` — header with "Simulated capture / real processing" +
  "Demo" chips and the explicit stub disclosure; links to `/calendar` as the other path.
- `src/components/ingest/IngestForm.tsx` — title / date / participants, transcript
  textarea (placeholder documents every accepted line format), `.txt` upload via
  `FileReader` (client-side, no server file parsing), **"Try a sample"** one-click
  fill, live line/char counters, inline error banner, submit spinner with progress copy,
  and a success panel showing segment count, per-template source badges (llm/fallback),
  action-item count and "Open meeting →" (`/meetings/<id>` — agent A's route; 404 on my
  branch until the merge, as expected).
- `src/components/ingest/sample.ts` — 14-line sample transcript.

### Local verification (dev :3004, explicit `DATABASE_PATH=./data/fathom.db`)

⚠ **Found (foundation bug, flagged to lead):** `.env.local` contains `DATABASE_PATH=`
(empty). Next.js loads it as `""`, and `src/db/index.ts` uses `??` (not `||`), so the
dev/build server opens SQLite's **private temporary DB** instead of `data/fathom.db` —
`/api/meetings` returned `count: 0` locally. `scripts/seed.ts` is unaffected (its
`loadEnv()` runs after the hoisted `import ../src/db`), and the deploy smoke test passes
`DATABASE_PATH` explicitly, and the VM gets it from `/etc/fathom/fathom.env` — so only
local dev is affected. Worked around by exporting `DATABASE_PATH` when starting dev;
did not edit `.env.local` (lead's file).

- Validation: empty → "Paste a transcript…", `!!! ??? ...` → "no readable text",
  `hi there` → "too short… (40+ characters)", missing title → "Give the meeting a title."
- Sample ingest (real LLM, 3.7 s): `{"segmentCount":14,"usedTimestamps":true,
  "summaries":[{"template":"standard","source":"llm","actionItems":3},
  {"template":"exec-brief","source":"llm","actionItems":3}],"actionItemCount":4,
  "generator":"llm"}`.
- Untimed 3-line paste → `usedTimestamps:false`, synthetic timeline, participants
  auto-derived from speakers (`["Priya","Marcus"]`).
- Unlabelled paragraph → 1 segment under speaker `Speaker`, still ingests.
- DB rows confirmed: Meeting `source=demo`, 14 TranscriptSegments, 2 Summaries
  (820/896 chars), 4 ActionItems; `/api/meetings` count went 8 → 9, so agent B's
  dashboard (same DB) will list it.
- `npx tsc --noEmit` clean, `npm run lint` clean (only agent C's pre-existing
  `HighlightBar` `_props` warning).

Commit: `5c3f2aa` "Demo-mode ingest: paste/upload transcript, real summarizeMeeting()
for standard + exec-brief" (pushed).

## 2026-09-25 — deploy 2 + live verification

### Deploy 2 — `rel-20260925-230003-62504`

typecheck → build (`/`, `/ingest`, `/api/ingest`, `/calendar`, `/api/calendar`) →
local smoke OK → ship → remote health OK → public verify OK. No rollback.

Verified on `http://51.170.90.41`:

| check | result |
|---|---|
| `GET /calendar` | **200** — provider cards, Demo chips render |
| `GET /ingest` | **200** — "Simulated capture / real processing" ×2, "Try a sample", "Accepted line formats" |
| `GET /api/health` | 200 |
| `POST /api/calendar` connect/outlook → `GET /calendar` | `{"provider":"outlook","connected":true,…}`, page server-renders "3 upcoming meetings detected (simulated)" |
| `POST /api/calendar` disconnect | `{"provider":null,"connected":false}` |
| **real ingest on live** `POST /api/ingest` | `m_demo_muh9pkym6tma`, 5 segments, `standard` + `exec-brief` both `source:"llm"`, 4 action items, 2.5 s |
| `GET /api/meetings` after ingest | `count` 8 → **9**, new row first, `source:"demo"` → same DB agent B's dashboard reads |
| `GET /meetings/m_demo_muh9pkym6tma` | **404** — expected: agent A's route is not deployed/merged yet |

Release history on the VM at this point: `221318` (lead, failed) → `221811` (lead, ok)
→ `224217` (mine, rolled back) → `224830` (mine, calendar) → `230003` (mine, ingest).
No other agent had deployed before me, so nothing of theirs was reverted.

---

## Handover / open items for the lead

1. **Worktree deploys need a real `node_modules`** — the symlink makes
   `.next/standalone/node_modules` a dangling absolute symlink on the VM
   (`Cannot find module 'next'`, auto-rollback). Fix per worktree:
   `rm node_modules && cp -al /home/abdulhadi/Projects/project/node_modules node_modules`
   (hard-link copy, no disk cost, not an `npm install`). Applies to agents A/B/C too.
2. **`.env.local` has an empty `DATABASE_PATH=`** → local `next dev`/`next build` open a
   private temp SQLite (`/api/meetings` = 0 rows). Suggest changing the line to
   `DATABASE_PATH=./data/fathom.db` or deleting it (default already points there);
   `src/db/index.ts` could also use `||` instead of `??`. Deployment is unaffected.
3. `/meetings/<id>` 404s for ingested meetings until agent A's route ships — the
   success panel's "Open meeting →" will 404 in the meantime (expected).
4. `npm run dev` (`--turbopack`) panics on a symlinked `node_modules`
   ("Symlink node_modules is invalid"); `npx next dev -p 3004` (webpack) works — also
   fixed by item 1.
