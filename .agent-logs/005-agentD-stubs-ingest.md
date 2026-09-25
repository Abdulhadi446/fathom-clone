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
