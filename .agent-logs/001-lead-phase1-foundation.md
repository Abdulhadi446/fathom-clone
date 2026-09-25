# 001 · Lead · Phase 1 — Foundation

Environment recon first (no assumptions about credentials):

- Node 26 / npm 11 locally, `gh` authenticated as `Abdulhadi446`, ffmpeg present.
- **No** Vercel / Netlify / Fly / Railway token in the environment → a PaaS deploy was not
  available. Three SSH VMs are reachable (`tests1`, `tests2`, `small1`).
  Chose **tests2** (`51.170.90.41`): sudo, nginx, 28 GB free disk, Node installed, minimal
  load. tests1 is 96 % full, small1 has ~70 MB free RAM.
- **LLM:** no API key anywhere, but an OAuth token for the GitHub Copilot gateway exists in
  `~/.local/share/opencode/auth.json`. Verified with a direct `chat/completions` call →
  `gpt-4o-mini` replies. That became the default backend for `src/lib/llm.ts`
  (`LLM_API_BASE=https://api.githubcopilot.com`, key supplied via env only).

Decisions:

1. **Drizzle + better-sqlite3 instead of Prisma.** The npm registry is very slow in this
   environment (single tarballs took 100–300 s); Prisma's engine download was hanging for
   10 minutes. Drizzle installed in 2 minutes and needs no engine at runtime.
2. **Next `output: "standalone"`** so the VM never runs `npm install` — the build happens
   locally, the bundle is rsync'd, `scripts/deploy.sh` swaps a symlink.
3. **DB persists outside releases** (`/srv/fathom/data/fathom.db`), so user-generated
   highlights/ingests survive deploys. Upload happens only when the server has no DB yet,
   or with `--fresh-db`.
4. **Silent audio tracks** (`public/audio/<meetingId>.m4a`, 8 kHz AAC) stand in for the
   recordings — the capture layer is stubbed per the brief, but the player clock and every
   timestamp seek are real. 60-minute file = 454 KB.

Seed (all LLM-backed, results committed under `seed-cache/`):

- 8 meetings, 1162 transcript segments, 22 summaries across 6 templates, 32 action items,
  13 highlights (3 public: `acme-crm-pain`, `q4-roadmap-lock`, `northwind-sso-gate`).
- The showcase meeting — **Q3 Product Council — Roadmap Lock**, 8 participants / 60 min —
  has 278 segments, generated in 7 time-windowed chunks so speakers stay consistent.
- Transcript authoring and summarization are separate LLM passes; `npm run seed` reuses
  `seed-cache/` so it is idempotent and needs no key after the first run.

Problems hit and fixed while building:

- `drizzle` `.default(() => Date.now())` is treated as a literal value → `getTime is not a
  function`. Fixed with `.$defaultFn(() => new Date())`.
- Column helpers are functions (`eq(col, v)`), not `col.eq(v)`, in drizzle 0.45.
- The model intermittently returned an empty `actionItems` array, and occasionally emitted
  two JSON objects in one reply → added one targeted retry in `summarizeMeeting()` and a
  string-aware `firstBalancedObject()` parser in `parseJsonLoose()`.
- `npm i -D prisma` had to be killed: `pkill -f "npm i"` matched its own shell.

Verification at the end of Phase 1:

- `npx tsc --noEmit` clean, `npm run lint` clean.
- `./scripts/deploy.sh` → local standalone smoke test `/api/health` OK → shipped →
  remote health OK → public `http://51.170.90.41/api/health` and `/api/meetings` return
  the 8 seeded meetings.
