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
