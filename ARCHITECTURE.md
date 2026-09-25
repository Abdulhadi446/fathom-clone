# ARCHITECTURE

A Fathom-style AI meeting notetaker: seeded meetings → transcripts → LLM summaries/templates →
action items → playback sync → highlights → public clip sharing → search → demo-mode ingest.

**Live URL:** `http://51.170.90.41/`
**Repo:** public GitHub repo created from this directory (see `.agent-logs/` for the session trail).

---

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind 4** — `src/app/*`
- **SQLite + Drizzle ORM + better-sqlite3** — `src/db/*`, single file DB, WAL mode
- **LLM:** any OpenAI-compatible endpoint, defaulting to the GitHub Copilot gateway
  (`src/lib/llm.ts`, config via env — no key is ever committed)
- **Deploy target:** a VM behind nginx (no Vercel/PaaS token was available in this
  environment, so the app ships as a Next.js *standalone* bundle to a host we control).

## Repo structure

```
src/
  app/                  routes (App Router) — see ownership map below
    api/                foundation-owned HTTP endpoints
  db/
    schema.ts           Drizzle schema  (FROZEN)
    index.ts            connection + DDL (FROZEN)
  lib/
    llm.ts              low-level chat client (chat, chatJSON, parseJsonLoose)
    summarize.ts        ★ THE summarization function (shared)
    transcript.ts       LLM transcript authoring for seed data
    queries.ts          shared read helpers (list/get/search)
    format.ts           shared formatting helpers
    load-env.ts         .env loader for scripts
  types/                ambient d.ts
scripts/
  seed.ts               seed script (transcript + summary generation + cache)
  deploy.sh             build → ship → health check → rollback
ops/                    systemd unit + nginx site
seed-cache/             committed LLM outputs so seeding is reproducible
public/audio/           committed silent audio tracks (one per meeting)
data/fathom.db          local SQLite (gitignored)
.agent-logs/            agent session log — committed as we go
```

## Run locally

```bash
npm install
cp .env.example .env.local      # add LLM_API_KEY for real summaries (optional)
npm run seed                    # builds the DB from seed-cache/ + LLM
npm run dev                     # http://localhost:3000
```

Without `LLM_API_KEY` the seed still works — `summarizeMeeting()` falls back to a
deterministic summarizer so no screen is ever empty.

## Deploy

```bash
./scripts/deploy.sh              # typecheck → build → local smoke test → ship → remote health check
./scripts/deploy.sh --fresh-db   # also overwrite the live DB with the local seed DB
```

The script is **safe to run concurrently** (flock), keeps the previous release for
automatic rollback, and never replaces the live SQLite file unless the server has none yet
or you pass `--fresh-db`. Server layout:

```
/srv/fathom/current      → symlink to the live release (standalone Next server, port 3100)
/srv/fathom/data/        → persistent SQLite (survives deploys)
/etc/fathom/fathom.env   → LLM_* + DATABASE_PATH (secret, not in git)
/etc/nginx/sites-enabled/fathom → reverse proxy on :80
```

## ★ The summarization function

```ts
import { summarizeMeeting, TEMPLATES, type TemplateId } from "@/lib/summarize";

const result = await summarizeMeeting(
  {
    title, startedAt, durationSeconds, participants,
    segments: [{ speaker, text, startTime, endTime }],   // seconds
  },
  "sales-call",                                          // any TEMPLATES[].id
);
// { template, content /* Markdown */, actionItems: string[], source: "llm" | "fallback" }
```

- **Owner: foundation.** Call it, don't fork it. It retries once when the model returns no
  action items and degrades to a deterministic fallback on any LLM error.
- Templates: `standard`, `sales-call`, `standup`, `interview`, `decisions`, `exec-brief`.
- `src/lib/llm.ts` (`chat` / `chatJSON`) is the transport — also shared, don't fork it.
- In the browser/server boundary: only import this from **server** code (route handlers,
  server components, scripts).

## Data access

`src/lib/queries.ts` gives every agent the same reads: `listMeetingsWithSnippet()`,
`getMeeting`, `getSegments`, `getSummaries`, `getActionItems`, `getHighlights`,
`getHighlightBySlug`, `searchAll(query)`. Need something else? Add a **new** file under
`src/lib/` rather than editing shared ones mid-flight.

---

## Route ownership map

Ownership is exclusive: never create, edit or rename a file owned by another agent.
If you need something an owner owns, ask the lead instead.

| Route / file | Owner | Notes |
|---|---|---|
| `src/db/schema.ts`, `src/db/index.ts` | **foundation (frozen)** | need a field? → flag the lead |
| `src/lib/llm.ts`, `src/lib/summarize.ts`, `src/lib/transcript.ts` | **foundation (frozen)** | call, don't modify |
| `src/lib/queries.ts`, `src/lib/format.ts` | foundation (read-mostly) | additive changes only, coordinate first |
| `src/app/api/health`, `src/app/api/meetings` | foundation | |
| `scripts/deploy.sh`, `ops/*` | foundation | everyone runs it, nobody edits it mid-run |
| `src/app/page.tsx`, `src/app/meetings/page.tsx`, `src/app/api/search/**` | **agent B** | dashboard + list + cross-meeting search |
| `src/app/meetings/[id]/**` | **agent A** | transcript player, summary tabs, action items |
| `src/app/api/meetings/[id]/**` | **agent A** | PATCH action items, etc. |
| `src/app/clip/[slug]/**`, `src/app/api/highlights/**` | **agent C** | highlight capture + public clip page |
| `src/app/calendar/**`, `src/app/api/ingest/**`, ingest wizard UI files | **agent D** | calendar stub + demo-mode ingest |

Shared UI conventions: dark, dense, neutral palette (Tailwind 4, no UI library).
Every agent commits incrementally, appends to `.agent-logs/`, and redeploys with
`./scripts/deploy.sh` — never leave work unpushed to the end.

---

## Parallel build (Phase 2)

Four agents work at the same time. Each one gets an isolated **git worktree** on its own
branch so nobody's edits collide:

| agent | worktree | branch | dev port |
|---|---|---|---|
| A meeting detail | `/home/abdulhadi/Projects/fathom-worktrees/agent-a` | `agent-a` | 3001 |
| B dashboard/search | `/home/abdulhadi/Projects/fathom-worktrees/agent-b` | `agent-b` | 3002 |
| C sharing/highlights | `/home/abdulhadi/Projects/fathom-worktrees/agent-c` | `agent-c` | 3003 |
| D stubs/ingest | `/home/abdulhadi/Projects/fathom-worktrees/agent-d` | `agent-d` | 3004 |

- `node_modules` is a symlink to the main checkout — **do not add npm dependencies**
  (the registry here is extremely slow); if you think you need one, ask the lead.
- Each worktree has its own `data/fathom.db` (`npm run seed` takes ~2 s from `seed-cache/`).
- Commit **only your own files** (`git add <paths>`, never `git add -A`), push your branch
  incrementally (`git push -u origin agent-<x>`), and append to `.agent-logs/`.
- `./scripts/deploy.sh` is flock-protected: builds + deploys from *your* worktree, smoke
  tests locally, health checks remotely and rolls back automatically. Deploys queue, so
  deploy at milestones, not after every edit.
