# 002 — agent A — meeting detail (`/meetings/[id]`)

Owner: agent A. Scope: transcript player, summary tabs, action items, header,
HighlightBar integration.

## Plan (start of session)

Owned paths:

- `src/app/meetings/[id]/**` (page, loading, not-found)
- `src/app/api/meetings/[id]/**` (PATCH action items)
- `src/components/meeting/**` (new dir)

Read `ARCHITECTURE.md` + `SCHEMA.md` first. Confirmed seed data in this worktree
(`data/fathom.db`): 8 meetings, `m_q3_product_council` = 60 min / 8 participants /
278 segments / 3 templates (`standard`, `decisions`, `exec-brief`).

No dependency changes — everything hand-rolled (markdown renderer, scrub bar,
virtual audio clock fallback, incremental transcript window).

## Log

- 2026-09-25 — scaffolding components + page + PATCH route (commit to follow).
