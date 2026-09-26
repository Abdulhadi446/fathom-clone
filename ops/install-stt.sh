#!/usr/bin/env bash
# Local (on-box) speech-to-text for recorded meeting audio.
#   ./ops/install-stt.sh
# Creates /srv/fathom/stt (python venv), installs faster-whisper and pre-caches
# the model so the first transcription doesn't stall. No API key, no cloud STT.
set -euo pipefail
VENV=/srv/fathom/stt
MODEL="${STT_MODEL:-base.en}"
echo "▸ venv $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" -q install --upgrade pip
echo "▸ install faster-whisper"
"$VENV/bin/pip" -q install -r "$(dirname "$0")/stt/requirements.txt"
echo "▸ cache model $MODEL"
"$VENV/bin/python" - "$MODEL" <<'PY'
import sys
from faster_whisper import WhisperModel
WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=2)
print("model ready:", sys.argv[1])
PY
echo "▸ done — set STT_BIN=$VENV/bin/python in the app env if you move it"
