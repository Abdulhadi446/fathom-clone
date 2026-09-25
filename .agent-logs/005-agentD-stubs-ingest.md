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
