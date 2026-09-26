#!/usr/bin/env python3
"""Local speech-to-text for recorded meeting audio.

    python3 transcribe.py /path/to/audio.webm [model]

Prints one JSON object to stdout:
    {"language": "en", "duration": 12.4, "segments": [{"start": 0.0, "end": 2.1, "text": "..."}]}

Uses faster-whisper (CTranslate2, CPU int8) installed by ops/install-stt.sh into
/srv/fathom/stt. Nothing leaves the box.
"""
import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: transcribe.py <audio> [model]"}))
        return 2
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("STT_MODEL", "base.en")
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"no such file: {audio_path}"}))
        return 2

    from faster_whisper import WhisperModel  # imported late so --help style errors stay readable

    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        cpu_threads=int(os.environ.get("STT_THREADS", "2")),
    )
    segments, info = model.transcribe(
        audio_path,
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    out = [
        {"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()}
        for seg in segments
        if seg.text and seg.text.strip()
    ]
    print(
        json.dumps(
            {
                "language": getattr(info, "language", "unknown"),
                "duration": round(getattr(info, "duration", 0.0) or 0.0, 2),
                "segments": out,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
