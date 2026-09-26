# 009 — lead — phase 6: test everything, make it production ready

**Scope:** turn the Phase-5 deployment into something we would hand to a stranger: an
end-to-end test suite that actually runs, production hardening (headers, service, backups,
diagnostics), and a verified run against the live HTTPS site.

## What was built

### 1. `scripts/smoke.sh` — black-box test suite (114 checks)

Talks to a running deployment over HTTP only; creates its own accounts and deletes them:

- public surface: redirects stay on `https://`, every public page 200, unknown path 307
  signed-out / 404 signed-in, robots.txt, favicon, 401 on every unauthenticated API,
  security headers present
- auth: signup (incl. duplicate → 409, weak password → 400, bad email → 400), wrong
  password → 401, logout kills the session, re-login, `Secure` cookie flag on https
- ingest: pasted transcript (asserts LLM actually produced action items), audio multipart
  upload, video `kind`, rejection when there is nothing to summarize
- media: full GET, `Accept-Ranges`, `206` partial, `416` unsatisfiable, 404 unknown,
  401 logged-out
- optional `SMOKE_STT_WAV=<speech wav>` → asserts on-box transcription (`transcribed:true`)
  and that the meeting renders transcript rows
- action items: list → toggle → verify persisted → untoggle, plus 400/404 error shapes
- highlights: create (201), invalid input 400, list, share → slug → **public clip reachable
  while signed out**, edit, revoke-by-other-user 404, unknown ids 404
- search, calendar connect/disconnect + unknown action 400
- isolation: account B cannot read, edit, delete, list or download any of A's rows
- email-link endpoints: verify/reset with junk tokens → 400, forgot-password uniform 200
  (no account enumeration), resend-verification answers
- account safety: change password (wrong current 400, old password dead, new password works),
  delete account (wrong password 400 → correct → 200, session invalid, meeting gone), B cleaned up
- rate limiting: 11 bad logins → 429 (deliberately last; warms the IP limiter for a minute)

Fixing the suite found real contract details: highlight POST returns **201**, a too-short
transcript is **400**, `GET /api/meetings/[id]/action-items` **did not exist** (added —
owner-scoped, 404 for everyone else), action ids are `act_*`, an unauthenticated
`/api/audio/<unknown>` is 404, and unknown paths redirect signed-out users instead of 404ing.
Helpers `body_num`/`detail` were initially written by a patch that silently no-op'd — the
suite then failed for the right reasons and got fixed; lesson: assert on patch anchors.

Local run: **108/108 in 17 s**. Live run after deploy: **114/114**.

### 2. App hardening

- `next.config.ts` — security headers on all routes, `immutable` caching for `/_next/static`
- `src/app/not-found.tsx`, `src/app/error.tsx` — branded 404 + error boundary with a
  journalctl hint
- `src/app/robots.ts` — disallow everything (private app; share links are sent, not indexed)
- `/api/health` — `COUNT(*)` per table instead of loading rows, plus `stt.available`,
  `mail.configured`, `uptimeSec`
- housekeeping: `purgeExpiredSessions()` was never executed and compared timestamps against
  `CURRENT_TIMESTAMP` (wrong for `timestamp_ms`) — fixed, together with a new
  `purgeExpiredAuthTokens()`, both called opportunistically on successful login

### 3. Ops

- `ops/nginx-fathom.conf` — gzip, `server_tokens off`, security headers, HSTS (ignored over
  plain http, so IP access still works), on top of the forwarded-proto map from phase 5
- `ops/fathom.service` — `NoNewPrivileges`, `PrivateTmp`, `ProtectHome`, `ProtectSystem=full`,
  kernel/namespace restrictions, start-rate limit, `HOME`/`HF_HOME` under `/srv/fathom/stt`
- `ops/backup.sh` — integrity-checked online SQLite backup + uploads tarball, gzipped,
  7-day retention; installed to `/srv/fathom/ops/` and scheduled by `/etc/cron.d/fathom-backup`
  (daily 03:17) by the deploy script
- `scripts/deploy.sh` — `--smoke` flag, ships the backup script and installs the cron,
  `PUBLIC_URL` defaults to the https domain
- whisper cache moved from `/home/ubuntu/.cache/huggingface` to `/srv/fathom/stt/hf-cache`
  (142 MB) so `ProtectHome=true` cannot break transcription — verified by transcribing a
  clip with the new env, then again through the deployed service during the smoke run

## Verification (live, https://tests.thetrillioniar.me)

- `./scripts/smoke.sh` with `SMOKE_STT_WAV` → **114 passed / 0 failed**, including
  on-box transcription of a 15 s clip through the hardened service
- headers present twice (nginx + Next), robots.txt correct, unknown path → https login redirect
- health: all counts 0 after the suite cleaned up; `llm.configured`, `stt.available`,
  `mail.configured` all true
- backup ran manually: `fathom-<stamp>.db.gz` + `uploads-<stamp>.tgz` in `/srv/fathom/backups`,
  cron file installed; disk 41 %, swap 955 MB/10 GB
- journal: no errors since the env fix; nginx error log empty; uploads dir empty

## Files

`scripts/smoke.sh` (new), `ops/backup.sh` (new), `ops/fathom.service`,
`ops/nginx-fathom.conf`, `scripts/deploy.sh`, `next.config.ts`, `src/app/{not-found,error,robots}.tsx`,
`src/app/api/health/route.ts`, `src/app/api/meetings/[id]/action-items/route.ts` (GET),
`src/lib/{auth,tokens}.ts`, `src/app/api/auth/login/route.ts`,
`README.md` (Test + Operate), `ARCHITECTURE.md` (Production hardening & verification).

## Handover

- Run `./scripts/smoke.sh` after any deploy; wire it into CI if the repo grows one.
- Nightly backups land in `/srv/fathom/backups`; restore steps are in README → Operate.
- Resend still only delivers to the account's own address until `EMAIL_FROM` is a verified
  domain — signup/reset links are shown honestly as `emailSent:false` + `mailError`.
