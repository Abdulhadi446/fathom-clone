# 006 — lead — Phase 3: integration, verification, final deploy

Scope: merge the four agent branches, resolve cross-cutting conflicts, fix data quality,
verify every surface end-to-end, deploy the integrated build, and publish the final docs.

---

## 2026-09-26 — merge

- All four branches were pushed: `agent-a` (meeting detail), `agent-b` (dashboard/search),
  `agent-c` (highlights/clip), `agent-d` (calendar/ingest).
- `agent-a` merged `origin/agent-b`, `origin/agent-c`, `origin/agent-d` first (it is the
  only branch that had to re-render `HighlightBar` and honour `?t=` / `?template=`).
  One real conflict: both A and C appended helpers to `src/lib/queries.ts` — resolved by
  keeping both blocks (append-only file, no logic overlap).
- Fast-forwarded `master` to the merge result (`8f09af3`): 76 files, ~9646 insertions
  over the Phase-1 foundation.
- Frozen files (`src/db/*`, `src/lib/llm.ts`, `summarize.ts`, `transcript.ts`,
  `layout.tsx`, `Nav.tsx`, `globals.css`, `deploy.sh`, `ops/*`) were **not** modified by
  any subagent. Verified with `git diff 4bb4c0c..master -- <paths>`.

## 2026-09-26 — seed data quality

Two real defects found by reading the generated data, both fixed in `scripts/seed.ts`:

1. **Time-window gaps.** The chunked LLM transcript generator produced coverage holes at
   chunk boundaries (worst: 61 s of silence inside a meeting). Added
   `fillWindows()` / `windowBounds()` post-processing that re-maps every window linearly
   onto its bounds and re-clamps segment times — deterministic, idempotent, runs after
   `seed-cache/` read and before insert. Result: max gap per meeting now ≤ 5 s.
   Signature bump: `SUMMARY_PROMPT_VERSION = 2`.
2. **Highlights floating over silence.** 5 of 13 highlights landed in those gaps
   (including the public `acme-crm-pain` clip), and several `note` strings described
   content that no longer sat at their timestamps. Every highlight was re-anchored on
   real lines and its note rewritten to match what is actually in range — e.g.
   `acme-crm-pain` moved to the Salesforce/spreadsheets answer (248–300 s),
   `northwind-sso-gate` to Leo's SSO/expansion gate (1475–1556 s), the standup highlight
   to Marcus's flaky-worker blocker (95–126 s).

Verified after re-seed: all 13 highlights have 3–7 transcript lines inside the range and
the quoted note matches them.

## 2026-09-26 — final deploy

- `npx tsc --noEmit` → clean. `npm run lint` → clean (0 problems).
- `./scripts/deploy.sh --fresh-db` → `rel-20260926-125805-15045`,
  public health OK on `http://51.170.90.41`.
- Fixed a `deploy.sh` exit-code bug found by this run: the final
  `curl …api/meetings | head -c 300` died with SIGPIPE under `set -o pipefail`, so a
  successful deploy reported failure. Probe now captures to a variable first.

## 2026-09-26 — click-through verification (live, logged out)

| check | result |
|---|---|
| `/`, `/meetings`, `/search?q=roadmap` | 200 |
| `/meetings/m_q3_product_council` (+`?template=decisions&t=1800`) | 200, 133 KB |
| `/meetings/m_nope` | 404 |
| `/clip/q4-roadmap-lock`, `/clip/acme-crm-pain` | 200 (public, no session) |
| `/clip/nope-nope-123` | 404 |
| `/calendar`, `/ingest` | 200 |
| `/api/health`, `/api/meetings`, `/api/search?q=SSO\|blocker` | 200; search returns 9 hits for `roadmap` |
| audio byte-range | 206 |
| `PATCH /api/meetings/[id]/action-items` | toggles + persists; foreign meeting id → 404 |
| `POST/GET /api/calendar` | connect/disconnect persists to `User.calendar_*`; bad provider → 400 |
| highlight create → share → `/clip/<slug>` → delete | 200 → slug → clip renders note + transcript → delete → 404 |
| `POST /api/ingest` (real LLM, 3 s) | new `m_demo_*` meeting, 6 segments, `standard` + `exec-brief`, 4 action items |

The demo-ingested meeting (`m_demo_mui3r2iw5ish`, "Q4 Support Handoff (demo ingest)")
was **left in the live database on purpose** — it proves the ingest path works in
production. It is not part of the 8 seeded meetings; a `--fresh-db` deploy removes it.

Live counts after verification: `meetings 9, transcriptSegments 1168, summaries 24,
actionItems 36, highlights 13`.

## Final state

- Live: `http://51.170.90.41/` — nginx → systemd `fathom` → standalone build, SQLite at
  `/srv/fathom/data/fathom.db`.
- Repo: `https://github.com/Abdulhadi446/fathom-clone` (public), `master`, all work
  pushed, `.agent-logs/` committed incrementally as it happened.
- Docs: `SCHEMA.md` (tables, constraints, seeded cardinality) and `ARCHITECTURE.md`
  (stack, deploy, final route-ownership map, cross-cutting contracts) are current.

## Known limitations (deliberate, within the 24 h brief)

- Calendar connect is a **stub**: no OAuth, no tokens, no provider is contacted.
- Audio is a silent AAC file per meeting — the capture layer is stubbed; the UI says so.
- `/ingest` accepts pasted/uploaded transcripts (timestamped or sequential); no meeting
  link parser, no video/audio upload, no scheduled-join bot.
- No auth: everything runs as the seeded demo user `u_demo_alex`.
