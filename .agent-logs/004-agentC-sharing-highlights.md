# 004 · Agent C · Phase 2 — Highlights + public sharing

Scope (from the brief): `HighlightBar`, `/api/highlights/**`, public `/clip/[slug]`,
verification of the three seeded public clips.

## Start

- Read `ARCHITECTURE.md` + `SCHEMA.md` first. Worktree `agent-c` clean at `4bb4c0c`.
- Seeded the local worktree DB (`npm run seed`) → 8 meetings / 1162 segments /
  22 summaries / 32 action items / **13 highlights**, three of them public:
  `acme-crm-pain` (742–786s), `q4-roadmap-lock` (3110–3175s), `northwind-sso-gate` (1490–1545s).
- Plan: API first (create/list/patch/delete), then `HighlightBar`, then the clip page;
  two deploys (bar+API → clip page).

## API design (owned: `src/app/api/highlights/**`)

- `GET  /api/highlights?meetingId=` → list for one meeting (HighlightBar loads its own data).
- `POST /api/highlights` `{ meetingId, startTime, endTime, note? }` — note defaults to a
  transcript-derived trimmed excerpt; times clamped to the meeting duration.
- `PATCH /api/highlights/[id]` `{ note?, isPublic?, regenerateSlug?, clearSlug? }` —
  sharing on → slug generated if missing; sharing off → slug revoked; `regenerateSlug`
  mints a fresh 12-char id (old links die).
- `DELETE /api/highlights/[id]`.
- Slugs: `crypto.randomUUID()` stripped to 12 chars, uniqueness retried (no new deps).

## Shared contract implemented (for A / B / D / lead)

- `HighlightBar` props extended with **optional** `onSeek?: (time: number) => void`
  (the four foundation-issued props are unchanged). Seeking is signalled two ways so
  nobody has to import across worktrees:
  - `onSeek(time)` when the host passes it, **and**
  - `window.dispatchEvent(new CustomEvent("fathom:seek", { detail: { time } }))` —
    any player that listens for `fathom:seek` gets transcript/highlight clicks for free.
- Clip pages are **`force-dynamic`** and read the live DB on every request, so a
  highlight shared (or revoked) after deploy takes effect immediately — no revalidate call.
- Public gating on `/clip/[slug]`: `share_slug` must exist **and** `is_public = 1`,
  otherwise `notFound()` → clean dark 404 (no auth exists in the app; verified with a
  cookie-less curl).

## HighlightBar (owned: `src/components/highlights/HighlightBar.tsx`)

- With a selection: inline composer (range chip + excerpt-prefilled note + Save).
- Without a selection: "Highlight from now" captures `currentTime → min(+30s, duration)`.
- Inline list per highlight: play-from-here, inline note edit, delete (confirm),
  Share toggle (create/revoke slug) + copy-clip-link.

## Public clip page (owned: `src/app/clip/[slug]/**`, `src/components/clip/**`)

- Server-rendered: meeting title/date/participants/duration, highlight note as the H1,
  range chip, speaker-labelled transcript excerpt (context lines around the range,
  shared lines emphasised), copy-link button.
- `ClipPlayer`: audio at `/audio/<meetingId>.m4a` (silent stand-in, labelled
  "simulated recording"), seeks to the highlight start on load, plays the range and
  stops at `endTime`, listens for `fathom:seek` (transcript line click = seek),
  full-duration bar with the range marked.

## Local verification (dev :3003)

Dev gotcha found: `next dev` loads `.env.local`'s `DATABASE_PATH=` (empty string), which
beats the `?? fallback` in the frozen `src/db/index.ts` → the dev server silently opens a
throwaway DB (0 meetings, "meeting not found"). Workaround used here: start dev with
`DATABASE_PATH=$PWD/data/fathom.db` explicitly (production/smoke set the var, so only dev
is affected). Also: `next dev --turbopack` panics on the symlinked `node_modules` — plain
`next dev` (webpack) works.

API exercised against dev:

- `GET /api/highlights?meetingId=` → the meeting's rows, earliest first.
- `POST` without note → transcript-derived excerpt note
  (`"Good to know! So, write-back to Salesforce is a must…"` for 100–130s).
- `POST` inverted range → clamped to `min(start+30, duration)`; unknown meeting → 404.
- `PATCH {isPublic:true}` → slug minted (`1f04ca4aa9f7`); `{note}`; `{regenerateSlug:true}`
  → fresh slug (old link dies); `{isPublic:false}` → flag cleared **and** slug revoked;
  `{clearSlug:true}`; unknown id → 404.
- `DELETE` → ok, second DELETE → 404. Test rows deleted afterwards (13 highlights restored).

Clip pages (headless Chromium + curl):

- `/clip/acme-crm-pain`, `/clip/q4-roadmap-lock`, `/clip/northwind-sso-gate` → 200 with
  note-as-`<title>`, participants, range chip, player seeked to the range, transcript.
- Bogus slug → **404** with the custom dark "This clip isn't available" page.
- Slug that exists but `is_public = 0` (created via `regenerateSlug` on a private
  highlight) → also 404, then cleaned up.
- Screenshots reviewed: q4 clip emphasises its 12 in-range lines, player playhead sits on
  the range start, bar states (selection composer / highlight-from-now) render correctly.

## Commit

- `51d36ce` — Highlights: /api/highlights CRUD + share toggling, HighlightBar, public
  /clip/[slug] (+ temporary `/clip/preview` harness for clicking through the bar).
  Pushed to `origin/agent-c`.

## Seed-data problem found (for the lead)

`acme-crm-pain` (742–786s) sits inside a **transcript gap** — the Acme transcript jumps
312s → 900s (and again 1276s → 1800s), so *zero* lines overlap the shared range. The clip
page handles it (3+4 closest lines + a "no lines inside the window — closest conversation
shown" note), but the "shared lines emphasised" moment is empty for that clip. The other
two are healthy (q4: 12 in-range lines, northwind: 10). Suggested fix for whoever owns the
seed: move `hl_m_acme_discovery_0` onto the CRM exchange around 1086–1129s
(“It allows notes to be pushed directly into your CRM.”), or fill the transcript gaps.

## Deploy 1 — rollback, fix, success

- **First attempt `rel-20260925-231221-67476` FAILED and auto-rolled back** (live site
  never went down): `Error: Cannot find module 'next'` on the VM. Root cause is the
  worktree `node_modules` symlink — `next build` copies it verbatim into
  `.next/standalone/node_modules`, so the tarball ships an absolute symlink that dangles
  on the server (the local smoke test passes because the target exists here). Agents B
  and D hit the identical failure first and documented the fix; applied the same, no
  frozen file touched and nothing installed:

  ```bash
  rm node_modules && cp -al /home/abdulhadi/Projects/project/node_modules node_modules
  ```

- **`rel-20260925-231627-68934` deployed OK** (typecheck + build + local smoke + remote
  health + public health all green).

### Live verification, cookie-less `curl` (deploy 1)

- `GET /clip/q4-roadmap-lock` → **200**, `<title>The actual Q4 commitment list is read
  back and agreed — Fathom clip</title>`, **zero `Set-Cookie`/`Location` headers** (no auth
  anywhere in the app, no login redirect).
- `/clip/acme-crm-pain`, `/clip/northwind-sso-gate` → **200**; `/clip/not-a-real-slug-xyz`
  → **404**; `/clip/preview` (bar harness) → 200.
- Live write path: `POST /api/highlights` → created `hl_cc91…` on `m_sprint42_standup`,
  `PATCH {isPublic:true}` → slug `9c9da37e0f8b`, `/clip/9c9da37e0f8b` → 200,
  `PATCH {isPublic:false}` → revoked, `DELETE` → removed (row count restored to 1).

## Deploy 2 — `rel-20260925-232207-70571`

Polish shipped: muted-autoplay fallback (unmuted play → muted retry → "press play"
message), an "exploring past the clip — replay re-arms the auto-stop" indicator, and the
temporary `/clip/preview` harness removed (it had served its purpose: clicking through
HighlightBar states locally; ownership map grants me `src/app/clip/[slug]/**`, so the
extra route is gone).

Final `npx tsc --noEmit` clean, `npm run lint` clean, deploy typecheck + build + local
smoke + remote health all green.

### Live verification after deploy 2 (all cookie-less `curl`)

- `GET /clip/q4-roadmap-lock` → **200**, `HTTP/1.1 200 OK`, **0 `Set-Cookie` headers**,
  `<title>The actual Q4 commitment list is read back and agreed — Fathom clip</title>`,
  contains the "simulated recording" label and `/audio/m_q3_product_council.m4a`.
- `/clip/acme-crm-pain` → 200, `/clip/northwind-sso-gate` → 200.
- `/clip/bogus-slug-12345` → **404** (custom dark not-found page, `notFound()`).
- `/api/health` → 200, `/api/highlights?meetingId=…` → 200 with the seeded rows.
- `/clip/preview` → 404 (harness deleted).

## Handover notes for the lead

1. **`acme-crm-pain` sits in a transcript gap** (Acme transcript jumps 312s → 900s). The
   page degrades gracefully (closest lines + "no lines inside the window" notice), but if
   you want the emphasised-lines moment there, move `hl_m_acme_discovery_0` onto the CRM
   exchange ≈ 1086–1129s (“…notes to be pushed directly into your CRM”) or fix the seed
   gaps in `seed-cache/`. The other two seeded clips are healthy (12 and 10 in-range lines).
2. **Seek contract for agent A / anyone**: `HighlightBar` fires
   `window.dispatchEvent(new CustomEvent("fathom:seek", { detail: { time } }))` *and* calls
   the optional `onSeek(time)` prop; `ClipPlayer` listens for the same event. Wire your
   `<audio>` element once and every highlight/transcript click works.
3. **Worktree deploys need the hardlink `node_modules`** (same failure + fix as B and D
   logged): `rm node_modules && cp -al …/project/node_modules node_modules`. Worth fixing
   centrally in `deploy.sh` staging (`cp --dereference`) after the run.
4. Dev quirk (already flagged by B/D): `.env.local`'s empty `DATABASE_PATH=` defeats the
   `??` fallback in `src/db/index.ts` for `next dev`; production sets the var explicitly.

## Repo hygiene

- The first (failed, symlinked-`node_modules`) build leaked 31 Next dist files into a
  stray `project/` dir at the worktree root; `git add -A` picked them up in `83cfb44`.
  Removed from git and disk (`git rm -r --cached project && rm -rf project`). Builds after
  the hardlink fix no longer create it (verified: second build untouched). No `.gitignore`
  edit needed — kept strictly to files I own.
