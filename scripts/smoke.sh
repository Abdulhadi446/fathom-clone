#!/usr/bin/env bash
#
# End-to-end smoke suite for the Fathom clone. Black-box: talks to a running
# deployment over HTTP and creates its own throwaway accounts.
#
#   ./scripts/smoke.sh                                  test https://tests.thetrillioniar.me
#   ./scripts/smoke.sh http://127.0.0.1:3100            test a local standalone server
#   SMOKE_STT_WAV=/tmp/speech.wav ./scripts/smoke.sh    also assert on-box transcription
#
# Exits non-zero if any check fails. Safe to run against production: it signs up
# two throwaway users and deletes both accounts at the end.
#
set -uo pipefail

BASE="${1:-${SMOKE_BASE:-https://tests.thetrillioniar.me}}"
BASE="${BASE%/}"
STT_WAV="${SMOKE_STT_WAV:-}"

WORK="$(mktemp -d /tmp/fathom-smoke-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

JAR_A="$WORK/a.jar"; JAR_B="$WORK/b.jar"
BODY="$WORK/body"; HEAD="$WORK/head"
PASS=0; FAIL=0; FAILED=()
JAR=""

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

# check <description> <0|1> [detail]
check() {
  local desc="$1" rc="$2" detail="${3:-}"
  if [ "$rc" = "0" ]; then
    PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m  %s\n' "$desc"
  else
    FAIL=$((FAIL + 1)); FAILED+=("$desc${detail:+ — $detail}")
    printf '  \033[31mFAIL\033[0m  %s%s\n' "$desc" "${detail:+ — $detail}"
  fi
}

# cond / ncond run a command and print 0 (ok) or 1 (bad) for `check`
cond()  { if "$@" >/dev/null 2>&1; then echo 0; else echo 1; fi; }
ncond() { if "$@" >/dev/null 2>&1; then echo 1; else echo 0; fi; }

# req METHOD PATH [curl-args...] — fills $CODE, $BODY, $HEAD
req() {
  local method="$1" path="$2"; shift 2
  local jar=()
  [ -n "$JAR" ] && jar=(-b "$JAR" -c "$JAR")
  CODE=$(curl -sS -o "$BODY" -D "$HEAD" -w '%{http_code}' --max-time "${SMOKE_TIMEOUT:-120}" \
    -X "$method" "${jar[@]}" "$@" "$BASE$path" 2>"$WORK/curl.err") || CODE="curl-error"
}

status_is() { [ "$CODE" = "$1" ]; }
status_in() { local s; for s in "$@"; do [ "$CODE" = "$s" ] && return 0; done; return 1; }
body_has()   { [ -n "$1" ] || return 1; grep -q -- "$1" "$BODY" 2>/dev/null; }
head_has()   { [ -n "$1" ] || return 1; grep -qi -- "$1" "$HEAD" 2>/dev/null; }
body_id()    { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" "$BODY" | head -1; }
body_num()   { grep -o "\"$1\":[0-9]*" "$BODY" 2>/dev/null | head -1 | cut -d: -f2; }
# short excerpt of the last response body, for failure details
detail()     { printf 'got=%s %s' "$CODE" "$(head -c 160 "$BODY" 2>/dev/null | tr '\n' ' ')"; }

UID_A="smoke-a-$(date +%s)-$RANDOM"
UID_B="smoke-b-$(date +%s)-$RANDOM"
MAIL_A="$UID_A@example.com"
MAIL_B="$UID_B@example.com"
PW_A="Smoke-pass-a-1"
PW_B="Smoke-pass-b-1"
MEETING_A=""; HIGHLIGHT_A=""; AUDIO_ID=""; ITEM_ID=""; CLIP_SLUG=""

# ---------------------------------------------------------------------------
say "public surface"
req GET "/"
check "/ redirects (307)" "$(cond status_is 307)"
LOC=$(grep -i '^location:' "$HEAD" 2>/dev/null | tr -d '\r')
case "$BASE" in
  https://*)
    check "redirect stays on https" "$(cond grep -q "^location: $BASE" "$HEAD")" "$LOC"
    ;;
  *) note "http base — https redirect assertion skipped" ;;
esac

for p in /login /signup /forgot-password /reset-password /verify-email; do
  req GET "$p"; check "$p → 200" "$(cond status_is 200)" "got=$CODE"
done
req GET "/settings"; check "/settings signed out → 307" "$(cond status_is 307)" "got=$CODE"

req GET "/robots.txt"
check "robots.txt disallows crawling" "$(cond body_has 'Disallow: /')" "got=$CODE"
# signed out, unknown paths bounce to login (middleware); the signed-in case is
# checked after signup below
req GET "/this-page-does-not-exist"
check "unknown path signed out → 307" "$(cond status_is 307)" "got=$CODE"
req GET "/favicon.ico"; check "favicon → 200" "$(cond status_is 200)" "got=$CODE"

req GET "/api/health"
check "health ok" "$(cond status_is 200)" "got=$CODE"
check "health reports llm" "$(cond body_has '"llm":{')"
check "health reports stt" "$(cond body_has '"stt":{')"
check "health reports mail" "$(cond body_has '"mail":{')"
STT_ON=0; body_has '"available":true' && STT_ON=1

for p in "/api/meetings" "/api/search?q=hello" "/api/auth/me" "/api/account" "/api/calendar"; do
  req GET "$p"; check "GET $p unauthenticated → 401" "$(cond status_is 401)" "got=$CODE"
done
req GET "/api/audio/nope"
check "GET /api/audio/nope unauthenticated → 401/404" "$(status_in 401 404 && echo 0 || echo 1)" "$(detail)"
req POST "/api/ingest"
check "ingest unauthenticated → 401" "$(cond status_is 401)" "got=$CODE"
req PATCH "/api/highlights/h_x" -d '{}'
check "highlight PATCH unauthenticated → 401" "$(cond status_is 401)" "got=$CODE"

say "security headers"
req GET "/login"
for h in "x-content-type-options: nosniff" "x-frame-options" "referrer-policy" "permissions-policy"; do
  check "header: $h" "$(cond head_has "$h")"
done
case "$BASE" in
  https://*) check "header: strict-transport-security" "$(cond head_has 'strict-transport-security')" ;;
esac

# ---------------------------------------------------------------------------
say "sign up / log in"
JAR="$JAR_A"
req POST "/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke A\",\"email\":\"$MAIL_A\",\"password\":\"$PW_A\"}"
check "signup A → 201" "$(cond status_is 201)" "$(detail)"
case "$BASE" in
  https://*) check "session cookie is Secure" "$(cond head_has 'set-cookie:.*secure')" ;;
esac
check "session cookie stored" "$(cond test -s "$JAR_A")"

req POST "/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"name\":\"Dup\",\"email\":\"$MAIL_A\",\"password\":\"$PW_A\"}"
check "duplicate signup → 409" "$(cond status_is 409)" "got=$CODE"
req POST "/api/auth/signup" -H 'content-type: application/json' \
  -d '{"name":"Weak","email":"weak@example.com","password":"123"}'
check "weak password → 400" "$(cond status_is 400)" "got=$CODE"
req POST "/api/auth/signup" -H 'content-type: application/json' \
  -d '{"name":"Bad","email":"not-an-email","password":"long-enough-pass"}'
check "invalid email → 400" "$(cond status_is 400)" "got=$CODE"

JAR=""
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"wrong-password-x\"}"
check "wrong password → 401" "$(cond status_is 401)" "got=$CODE"
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"$PW_A\"}"
check "login A → 200" "$(cond status_is 200)" "$(detail)"
JAR="$JAR_A"

req GET "/api/auth/me"; check "/api/auth/me shows A" "$(cond body_has "$MAIL_A")" "$(detail)"
req GET "/settings"; check "/settings signed in → 200" "$(cond status_is 200)" "got=$CODE"
req GET "/"; check "/ signed in → 200" "$(cond status_is 200)" "got=$CODE"

req POST "/api/auth/logout"
check "logout → 200" "$(cond status_is 200)" "$(detail)"
req GET "/api/auth/me"
check "session dead after logout" "$(cond status_is 401)" "got=$CODE"
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"$PW_A\"}"
check "login again after logout" "$(cond status_is 200)" "$(detail)"
JAR="$JAR_A"
req GET "/api/auth/me"
check "signed in again after logout" "$(cond body_has "$MAIL_A")" "$(detail)"
req GET "/this-page-does-not-exist"
check "unknown path signed in → 404" "$(cond status_is 404)" "got=$CODE"

# ---------------------------------------------------------------------------
say "ingest (pasted transcript) + meeting"
TX="[$(date +%H:%M)] Smoke A: the smoke test fired the deploy pipeline and approved the migration plan"
req POST "/api/ingest" -F "title=Smoke $UID_A" -F "participants=Smoke A, Smoke B" \
  -F "kind=video" -F "transcript=$TX"
check "ingest transcript → 200" "$(cond status_is 200)" "$(detail)"
MEETING_A=$(body_id meetingId)
check "meetingId returned" "$(cond test -n "$MEETING_A")" "body=$BODY"
AI_COUNT=$(body_num actionItemCount)
if [ -n "$AI_COUNT" ] && [ "$AI_COUNT" != "0" ]; then check "LLM summary produced action items" 0 "$AI_COUNT items"; else check "LLM summary produced action items" 1 "actionItemCount=$AI_COUNT"; fi

req POST "/api/ingest" -F "title=No content" -F "participants=Smoke A"
check "ingest without transcript/audio → 400" "$(cond status_is 400)" "got=$CODE"

req GET "/api/meetings"
check "meeting listed" "$(cond body_has "$MEETING_A")" "got=$CODE"
req GET "/meetings/$MEETING_A"; check "meeting page → 200" "$(cond status_is 200)" "got=$CODE"
req GET "/meetings/meeting_does_not_exist"
check "unknown meeting page → 404" "$(cond status_is 404)" "got=$CODE"

# ---------------------------------------------------------------------------
say "audio upload + range serving"
python3 - "$WORK/silence.wav" <<'PY'
import struct, sys, wave
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
    w.writeframes(struct.pack("<h", 0) * 8000)
PY
req POST "/api/ingest" -F "title=Smoke audio $UID_A" -F "participants=Smoke A" -F "kind=audio" \
  -F "fallback=[00:00] Smoke A: silent recording used to verify upload and range serving" -F "audio=@$WORK/silence.wav;type=audio/wav"
check "audio upload → 200" "$(cond status_is 200)" "$(detail)"
AUDIO_ID=$(body_id meetingId)

req GET "/api/audio/$AUDIO_ID"
check "audio full GET → 200" "$(cond status_is 200)" "got=$CODE"
check "audio advertises ranges" "$(cond head_has 'accept-ranges: bytes')"
check "audio content-type" "$(cond head_has 'content-type: audio/')"
req GET "/api/audio/$AUDIO_ID" -H 'Range: bytes=0-99'
check "audio Range → 206" "$(cond status_is 206)" "got=$CODE"
check "audio content-range header" "$(cond head_has 'content-range: bytes 0-99/')"
req GET "/api/audio/$AUDIO_ID" -H 'Range: bytes=999999999-'
check "unsatisfiable range → 416" "$(cond status_is 416)" "got=$CODE"
req GET "/api/audio/meeting_does_not_exist"
check "unknown audio → 404" "$(cond status_is 404)" "got=$CODE"

if [ -n "$STT_WAV" ] && [ "$STT_ON" = "1" ]; then
  req POST "/api/ingest" -F "title=Smoke stt $UID_A" -F "participants=Smoke A" -F "kind=audio" \
    -F "audio=@$STT_WAV;type=audio/wav"
  check "on-box transcription → 200" "$(cond status_is 200)" "$(detail)"
  check "response marks transcribed" "$(cond body_has '"transcribed":true')" "$BODY"
  STT_ID=$(body_id meetingId)
  req GET "/meetings/$STT_ID"
  check "transcribed meeting shows timestamps" "$(cond body_has '\[0:0')" "got=$CODE"
elif [ "$STT_ON" = "1" ]; then
  note "STT available (set SMOKE_STT_WAV=<speech wav> to assert transcription)"
else
  note "STT not installed — transcription checks skipped"
fi

# ---------------------------------------------------------------------------
say "action items"
req GET "/api/meetings/$MEETING_A/action-items"
check "list action items → 200" "$(cond status_is 200)" "$(detail)"
ITEM_ID=$(sed -n 's/.*"id":"\(act_[^"]*\)".*/\1/p' "$BODY" | head -1)
if [ -n "$ITEM_ID" ]; then
  req PATCH "/api/meetings/$MEETING_A/action-items" -H 'content-type: application/json' \
    -d "{\"id\":\"$ITEM_ID\",\"done\":true}"
  check "toggle action item → 200" "$(cond status_is 200)" "$(detail)"
  req GET "/api/meetings/$MEETING_A/action-items"
  ITEM_STATE=$(python3 -c "import json;d=json.load(open('$BODY'));print(next((i['done'] for i in d.get('items',[]) if i['id']=='$ITEM_ID'),'missing'))" 2>/dev/null || echo parse-error)
  check "toggle persisted" "$(cond test "$ITEM_STATE" = "True")" "state=$ITEM_STATE"
  req PATCH "/api/meetings/$MEETING_A/action-items" -H 'content-type: application/json' \
    -d "{\"id\":\"$ITEM_ID\",\"done\":false}"
  check "untoggle action item → 200" "$(cond status_is 200)" "$(detail)"
else
  check "action item id present" 1 "body=$BODY"
fi
req PATCH "/api/meetings/$MEETING_A/action-items" -H 'content-type: application/json' -d '{"items":[]}'
check "empty item list → 400" "$(cond status_is 400)" "got=$CODE"
req PATCH "/api/meetings/meeting_does_not_exist/action-items" -H 'content-type: application/json' \
  -d '{"id":"x","done":true}'
check "items on unknown meeting → 404" "$(cond status_is 404)" "got=$CODE"

# ---------------------------------------------------------------------------
say "highlights + public clip"
req POST "/api/highlights" -H 'content-type: application/json' \
  -d "{\"meetingId\":\"$MEETING_A\",\"startTime\":0,\"endTime\":12,\"note\":\"Smoke highlight\"}"
check "create highlight → 201" "$(cond status_is 201)" "$(detail)"
HIGHLIGHT_A=$(sed -n 's/.*"highlight":{"id":"\([^"]*\)".*/\1/p' "$BODY" | head -1)
check "highlight id returned" "$(cond test -n "$HIGHLIGHT_A")" "body=$BODY"

req POST "/api/highlights" -H 'content-type: application/json' \
  -d '{"meetingId":"meeting_does_not_exist","startTime":0,"endTime":12}'
check "highlight for unknown meeting → 404" "$(cond status_is 404)" "got=$CODE"
req POST "/api/highlights" -H 'content-type: application/json' \
  -d "{\"meetingId\":\"$MEETING_A\",\"startTime\":\"soon\",\"endTime\":2}"
check "non-numeric highlight range → 400" "$(cond status_is 400)" "got=$CODE"

req GET "/api/highlights?meetingId=$MEETING_A"
check "list highlights" "$(cond body_has "$HIGHLIGHT_A")" "got=$CODE"
req GET "/api/highlights"
check "highlights without meetingId → 400" "$(cond status_is 400)" "got=$CODE"

req PATCH "/api/highlights/$HIGHLIGHT_A" -H 'content-type: application/json' -d '{"isPublic":true}'
check "share highlight → 200" "$(cond status_is 200)" "$(detail)"
CLIP_SLUG=$(body_id shareSlug)
check "share slug minted" "$(cond test -n "$CLIP_SLUG")" "body=$BODY"
if [ -n "$CLIP_SLUG" ]; then
  JAR=""
  req GET "/clip/$CLIP_SLUG"
  check "public clip → 200 (signed out)" "$(cond status_is 200)" "got=$CODE"
  req GET "/clip/doesnotexist00"
  check "unknown clip → 404" "$(cond status_is 404)" "got=$CODE"
  JAR="$JAR_A"
fi
req PATCH "/api/highlights/$HIGHLIGHT_A" -H 'content-type: application/json' -d '{"note":"Edited note"}'
check "edit highlight → 200" "$(cond body_has 'Edited note')" "$(detail)"
req PATCH "/api/highlights/h_does_not_exist" -H 'content-type: application/json' -d '{"note":"x"}'
check "edit unknown highlight → 404" "$(cond status_is 404)" "got=$CODE"

# ---------------------------------------------------------------------------
say "search + calendar"
req GET "/api/search?q=migration"
FOUND=$(body_num count)
if [ -n "$FOUND" ] && [ "$FOUND" != "0" ]; then check "search finds the meeting" 0 "count=$FOUND"; else check "search finds the meeting" 1 "$(detail)"; fi
req GET "/api/search?q=zz"
check "short query → count 0" "$(cond body_has '"count":0')" "got=$CODE"

req POST "/api/calendar" -H 'content-type: application/json' -d '{"action":"connect","provider":"google"}'
check "calendar connect → 200" "$(cond body_has '"connected":true')" "$(detail)"
req GET "/api/calendar"; check "calendar shows connected" "$(cond body_has '"connected":true')"
req POST "/api/calendar" -H 'content-type: application/json' -d '{"action":"nope"}'
check "unknown calendar action → 400" "$(cond status_is 400)" "got=$CODE"
req POST "/api/calendar" -H 'content-type: application/json' -d '{"action":"connect","provider":"skyNET"}'
check "unknown calendar provider → 400" "$(cond status_is 400)" "got=$CODE"

# ---------------------------------------------------------------------------
say "second account — data isolation"
JAR="$JAR_B"
req POST "/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke B\",\"email\":\"$MAIL_B\",\"password\":\"$PW_B\"}"
check "signup B → 201" "$(cond status_is 201)" "$(detail)"
req GET "/api/meetings"
check "B cannot see A's meeting" "$(ncond body_has "$MEETING_A")" "got=$CODE"
req GET "/meetings/$MEETING_A"
check "B cannot open A's meeting page" "$(cond status_is 404)" "got=$CODE"
req GET "/api/meetings/$MEETING_A/action-items"
check "B cannot list A's action items" "$(cond status_is 404)" "got=$CODE"
req PATCH "/api/meetings/$MEETING_A/action-items" -H 'content-type: application/json' \
  -d '{"id":"ai_nope","done":true}'
check "B cannot toggle A's items" "$(cond status_is 404)" "got=$CODE"
req PATCH "/api/highlights/$HIGHLIGHT_A" -H 'content-type: application/json' -d '{"note":"hijack"}'
check "B cannot edit A's highlight" "$(cond status_is 404)" "got=$CODE"
req DELETE "/api/highlights/$HIGHLIGHT_A"
check "B cannot delete A's highlight" "$(cond status_is 404)" "got=$CODE"
req GET "/api/highlights?meetingId=$MEETING_A"
check "B cannot list A's highlights" "$(cond status_is 404)" "got=$CODE"
req GET "/api/audio/$AUDIO_ID"
check "B cannot fetch A's audio" "$(status_in 401 404 && echo 0 || echo 1)" "got=$CODE"
req GET "/api/calendar"
check "B calendar not connected" "$(ncond body_has '"connected":true')" "got=$CODE"
if [ -n "$CLIP_SLUG" ]; then
  req GET "/clip/$CLIP_SLUG"
  check "A's public clip reachable by anyone" "$(cond status_is 200)" "got=$CODE"
fi

# ---------------------------------------------------------------------------
say "email link endpoints (surface)"
JAR="$JAR_B"
req POST "/api/auth/verify-email" -H 'content-type: application/json' -d '{"token":"made-up-token"}'
check "verify with junk token → 400" "$(cond status_is 400)" "got=$CODE"
req POST "/api/auth/resend-verification"
check "resend-verification answers" "$(status_in 200 429 && echo 0 || echo 1)" "$(detail)"
JAR=""
req POST "/api/auth/forgot-password" -H 'content-type: application/json' -d "{\"email\":\"$MAIL_A\"}"
check "forgot-password → 200" "$(cond status_is 200)" "got=$CODE"
req POST "/api/auth/forgot-password" -H 'content-type: application/json' \
  -d '{"email":"nobody-has-this@example.com"}'
check "forgot-password unknown address → 200 (no leak)" "$(cond status_is 200)" "got=$CODE"
req POST "/api/auth/reset-password" -H 'content-type: application/json' \
  -d '{"token":"made-up-token","password":"another-pass-99"}'
check "reset with junk token → 400" "$(cond status_is 400)" "got=$CODE"

# ---------------------------------------------------------------------------
say "account safety (change password, delete account)"
JAR="$JAR_A"
NEW_PW="Smoke-pass-a-2"
req POST "/api/auth/change-password" -H 'content-type: application/json' \
  -d "{\"currentPassword\":\"wrong\",\"newPassword\":\"$NEW_PW\"}"
check "change password, wrong current → 400" "$(cond status_is 400)" "got=$CODE"
req POST "/api/auth/change-password" -H 'content-type: application/json' \
  -d "{\"currentPassword\":\"$PW_A\",\"newPassword\":\"$NEW_PW\"}"
check "change password → 200" "$(cond status_is 200)" "$(detail)"
JAR=""
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"$PW_A\"}"
check "old password rejected" "$(cond status_is 401)" "got=$CODE"
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"$NEW_PW\"}"
check "new password accepted" "$(cond status_is 200)" "got=$CODE"
JAR="$JAR_A"

req DELETE "/api/account" -H 'content-type: application/json' -d '{"password":"wrong"}'
check "delete with wrong password → 400" "$(cond status_is 400)" "got=$CODE"
req DELETE "/api/account" -H 'content-type: application/json' -d "{\"password\":\"$NEW_PW\"}"
check "delete account → 200" "$(cond status_is 200)" "$(detail)"
req GET "/api/auth/me"; check "session invalid after delete" "$(cond status_is 401)" "got=$CODE"
JAR=""
req POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$MAIL_A\",\"password\":\"$NEW_PW\"}"
check "deleted account cannot log in" "$(cond status_is 401)" "got=$CODE"

JAR="$JAR_B"
req GET "/meetings/$MEETING_A"
check "A's meeting gone after delete" "$(cond status_is 404)" "got=$CODE"
req GET "/api/meetings/$MEETING_A/action-items"
check "A's action items gone after delete" "$(cond status_is 404)" "got=$CODE"

say "cleanup second account"
JAR="$JAR_B"
req DELETE "/api/account" -H 'content-type: application/json' -d "{\"password\":\"$PW_B\"}"
check "delete account B → 200" "$(cond status_is 200)" "$(detail)"

# ---------------------------------------------------------------------------
say "credential rate limiting (last — briefly trips the IP limiter)"
JAR=""
RATE_OK=1
for i in $(seq 1 11); do
  req POST "/api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$MAIL_A\",\"password\":\"guess-$i\"}"
  [ "$CODE" = "429" ] && RATE_OK=0
done
check "11th bad login → 429" "$RATE_OK" "last=$CODE"
note "IP login limiter is warm for ~60s afterwards (expected)"

# ---------------------------------------------------------------------------
printf '\n\033[1;36m▸ result\033[0m\n'
printf '  base:   %s\n' "$BASE"
printf '  passed: \033[32m%d\033[0m   failed: \033[31m%d\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\n  failures:\n'
  for f in "${FAILED[@]}"; do printf '   - %s\n' "$f"; done
  exit 1
fi
printf '\n  all green\n'
exit 0
