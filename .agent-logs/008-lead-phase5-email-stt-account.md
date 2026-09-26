# 008 — lead — Phase 5: HTTPS origin, email, local STT, account safety, richer capture

Follow-up to phase 4, driven by the user connecting a real domain and asking for the remaining
"production" pieces: **email verification, password reset, account deletion, on-box speech to
text, and voice *or* screen recording.**

## Domain / TLS

The site now lives at **https://tests.thetrillioniar.me/** (Cloudflare in front, origin nginx on
:80). Two things had to be fixed before anything else could work:

1. **Scheme.** nginx was overwriting `X-Forwarded-Proto` with `$scheme`, which is always `http`
   behind Cloudflare's Flexible SSL — so every redirect the app built pointed at `http://…` and
   a `Secure` cookie would never survive the hop. `ops/nginx-fathom.conf` now maps the
   forwarded scheme through (`map $http_x_forwarded_proto $fwd_proto`). The middleware rebuilds
   the redirect origin from `X-Forwarded-Host`/`Host` and forces `https` for anything that is
   not localhost or a bare IP, so the canonical host always ends up on TLS even if someone
   types `http://`.
2. **Cookie.** `createSession()` now marks the cookie `Secure` from the *actual* request
   (`X-Forwarded-Proto: https`), not from `NODE_ENV`, with `COOKIE_SECURE=1` as an override.
   Plain-IP access keeps working over http; the domain gets Secure cookies.

`APP_URL=https://tests.thetrillioniar.me` is the origin for links inside emails.

## Email (Resend)

`src/lib/mailer.ts` calls the Resend HTTP API with plain `fetch` (no SDK). Sender is
`EMAIL_FROM`, defaulting to Resend's own `onboarding@resend.dev`, which only delivers to the
address of the Resend account — the UI reports delivery failures instead of pretending the mail
went out. Note: the key arrived in `.env.local` misspelled as `RESENND_API_KEY`; it is read
under both names, but the file was corrected to `RESEND_API_KEY` and the same name is used on
the server.

- **Verification**: signup mints an `AuthToken(kind="verify_email")` (2-day TTL) and emails a
  link to `/verify-email?token=…`. The page redeems it on GET; Nav shows a "Verify email" pill
  until `User.email_verified_at` is set; `/api/auth/resend-verification` issues a fresh one
  (rate-limited).
- **Password reset**: `/forgot-password` → always the same 200 response (no account
  enumeration) → `/reset-password?token=…` (1-hour TTL) → the new hash is stored, **every**
  session for that user is deleted, and outstanding tokens are cleared.
- Tokens are stored as sha256 only and are burned on first use (`src/lib/tokens.ts`).

## Account safety

- `/settings` — change password (requires the current one) and **delete account**: typed email
  + password confirmation, then `DELETE /api/account` removes the user row (FK cascade takes
  sessions, tokens, meetings, transcript, summaries, action items, highlights), unlinks the
  stored recordings, and clears the cookie.
- Login form gained "Forgot password?".

## Local STT

`ops/install-stt.sh` builds `/srv/fathom/stt` (python venv), installs `faster-whisper`, and
pre-caches the `base.en` model. `ops/stt/transcribe.py` is shipped on every deploy and prints
`{language, duration, segments:[{start,end,text}]}`. `src/lib/stt.ts` spawns it with a 10-minute
timeout, **serialises** calls (2 cores / 954 MB box), and converts segments to the
`[m:ss] Name: text` lines the existing parser already understands.

Verified on the box with an espeak-ng generated clip: 15 s of speech → correct JSON segments in
22 s (model load included). `/api/ingest` now accepts a recording with **no** pasted transcript:
audio is stored, transcribed, and only then summarised. Failure paths: browser live captions are
used as a fallback, otherwise `422` and the stored file is removed. A pasted transcript always
wins over transcription.

## Capture UI

`Recorder.tsx` was rewritten:

- **Microphone** or **Screen** (screen shares can include the microphone; a silent share is
  rejected up front because there would be nothing to transcribe).
- **Playback before saving** — the take is previewed in an `<audio>`/`<video>` element with a
  Discard button; nothing is uploaded until you press "Transcribe & save".
- Live browser captions are kept only as the fallback mentioned above.
- Screen recordings are flagged (`Meeting.has_video`) so `/api/audio/[id]` serves `video/webm`
  and the meeting page renders a `<video>` panel with the same custom transport controls.

## Docs

`README` (features, env table, STT install), `ARCHITECTURE` (auth additions, capture pipeline
diagram, deploy layout), `SCHEMA` (`User.email_verified_at`, `Meeting.has_video`, `AuthToken`,
updated "how data enters").

## Known limits

- Resend's default sender means only the Resend account's own address actually receives mail —
  set `EMAIL_FROM` to a verified domain to reach anyone else.
- Transcription re-loads the model per request (~8–10 s overhead); a warm daemon was rejected
  because keeping `base.en` resident would swap on this 954 MB box.
- Calendar connect is still the stub (no OAuth credentials available).
