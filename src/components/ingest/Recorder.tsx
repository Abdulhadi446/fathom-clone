"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  userName: string;
}

interface FinalLine {
  at: number; // seconds from start
  text: string;
}

interface Result {
  meetingId: string;
  link: string;
  title: string;
  segmentCount: number;
  actionItemCount: number;
  generator: string;
  transcribed: boolean;
  warning: string | null;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function speechEngine(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    "MediaRecorder" in window
  );
}

function screenSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

function defaultTitle(): string {
  const d = new Date();
  return `Meeting — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

function pickMime(kind: "voice" | "screen"): string | undefined {
  const candidates =
    kind === "screen"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/**
 * Capture tab: record the microphone or the screen, listen to the take, then
 * send it. The uploaded file is transcribed **on the server** by the local
 * whisper model (`src/lib/stt.ts`); browser speech is kept only as a fallback
 * if that transcription fails.
 */
export default function Recorder({ userName }: Props) {
  const SpeechEngine = useRef(speechEngine()).current;
  const [canRecord] = useState(() => mediaSupported());
  const [canScreen] = useState(() => screenSupported());
  const [mode, setMode] = useState<"voice" | "screen">("voice");
  const [withMic, setWithMic] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<FinalLine[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [others, setOthers] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [take, setTake] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const keepAliveRef = useRef(false);
  const linesRef = useRef<FinalLine[]>([]);
  const elapsedRef = useRef(0);
  const takeRef = useRef<{ blob: Blob; url: string; seconds: number } | null>(null);

  useEffect(() => {
    return () => {
      keepAliveRef.current = false;
      recognitionRef.current?.abort?.();
      recorderRef.current?.stop?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const current = takeRef.current;
      if (current) URL.revokeObjectURL(current.url);
    };
  }, []);

  function clearTake() {
    const current = takeRef.current;
    if (current) URL.revokeObjectURL(current.url);
    takeRef.current = null;
    setTake(null);
  }

  async function start() {
    setError(null);
    if (!canRecord) {
      setError("This browser can't record — use Chrome or Edge, or switch to the paste/upload tab.");
      return;
    }
    clearTake();
    try {
      let stream: MediaStream;
      if (mode === "screen") {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const displayAudio = display.getAudioTracks();
        if (displayAudio.length > 0 || !withMic) {
          stream = display;
        } else {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream = new MediaStream([...display.getVideoTracks(), ...mic.getAudioTracks()]);
        }
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          setError("No audio in this recording — share a tab with audio, or tick the microphone option.");
          return;
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      const mime = pickMime(mode);
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const next = { blob, url, seconds: elapsedRef.current };
        takeRef.current = next;
        setTake(next);
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      // Live browser captions are only a safety net — the server transcribes
      // the uploaded file regardless (voice mode only).
      linesRef.current = [];
      setLines([]);
      setInterim("");
      if (mode === "voice" && SpeechEngine) {
        const recognition = new SpeechEngine();
        recognition.lang = navigator.language || "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let live = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;
            if (result.isFinal) {
              const at = (Date.now() - startedAtRef.current) / 1000;
              linesRef.current = [...linesRef.current, { at, text: text.trim() }];
              setLines(linesRef.current);
            } else {
              live += text;
            }
          }
          setInterim(live);
        };
        recognition.onend = () => {
          if (keepAliveRef.current) {
            try {
              recognition.start();
            } catch {
              /* already starting */
            }
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

      keepAliveRef.current = true;
      startedAtRef.current = Date.now();
      elapsedRef.current = 0;
      setElapsed(0);
      setRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        mode === "screen"
          ? "Couldn't start screen sharing — pick a window or tab and allow the recording."
          : `Couldn't open the microphone${message ? ` (${message})` : ""} — check browser permissions.`,
      );
    }
  }

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const next = (Date.now() - startedAtRef.current) / 1000;
      elapsedRef.current = next;
      setElapsed(next);
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  function stop() {
    keepAliveRef.current = false;
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setInterim("");
    setRecording(false);
  }

  async function save() {
    if (submitting) return;
    const current = takeRef.current;
    if (!current) {
      setError("Record something first — or use the paste/upload tab.");
      return;
    }
    if (!title.trim()) {
      setError("Give the meeting a title.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("title", title.trim());
      body.set(
        "startedAt",
        new Date(startedAtRef.current || Date.now() - current.seconds * 1000).toISOString(),
      );
      const people = [userName, ...others.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)];
      body.set("participants", [...new Set(people)].join(", "));
      body.set("kind", mode === "screen" ? "video" : "audio");
      body.set("audio", current.blob, mode === "screen" ? "screen-recording.webm" : "recording.webm");
      const fallbackText = linesRef.current
        .map((line) => `[${clock(line.at)}] ${userName}: ${line.text}`)
        .join("\n");
      if (fallbackText) body.set("fallback", fallbackText);

      const res = await fetch("/api/ingest", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as (Result & { error?: string }) | null;
      if (!res.ok || !data?.meetingId) {
        setError(data?.error ?? "Couldn't save the recording — please try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error — couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    clearTake();
    setLines([]);
    linesRef.current = [];
    setElapsed(0);
    setTitle(defaultTitle());
    setError(null);
  }

  if (result) {
    return (
      <section className="rounded-xl border border-teal-400/30 bg-teal-400/[0.04] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-400 text-xs font-bold text-black">
            ✓
          </span>
          <h2 className="text-sm font-semibold text-white">Recording saved</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          {result.transcribed ? "Transcribed on the server, " : ""}
          {result.segmentCount} transcript lines, {result.actionItemCount} action items,{" "}
          {result.generator === "llm" ? "AI summaries generated" : "summaries generated with the offline fallback"}
          {result.warning ? ` — ${result.warning}` : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={result.link}
            className="rounded-md bg-teal-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            Open meeting
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Record another
          </button>
        </div>
      </section>
    );
  }

  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";
  const field =
    "w-full rounded-md border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-teal-400/60 focus:outline-none";

  if (!canRecord) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-400">
        Recording needs <span className="text-neutral-200">Chrome</span>,{" "}
        <span className="text-neutral-200">Edge</span> or another browser with MediaRecorder.
        Use the <span className="text-neutral-200">Paste or upload</span> tab instead — the
        summaries and action items are identical.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="rec-title">
            Title
          </label>
          <input id="rec-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="rec-others">
            Other participants (optional)
          </label>
          <input
            id="rec-others"
            className={field}
            value={others}
            onChange={(e) => setOthers(e.target.value)}
            placeholder="Priya Raman, Marcus Hale"
          />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["voice", "screen"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={recording || (option === "screen" && !canScreen)}
              onClick={() => setMode(option)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                mode === option
                  ? "bg-neutral-800 text-white"
                  : "border border-neutral-800 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {option === "voice" ? "Microphone" : "Screen"}
            </button>
          ))}
        </div>

        {mode === "screen" && !recording && (
          <label className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={withMic}
              onChange={(e) => setWithMic(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-500"
            />
            Also record my microphone (recommended — screen shares are often silent)
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-md bg-red-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-400"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white" />
              Start {mode === "screen" ? "screen recording" : "recording"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-600 bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-neutral-100 hover:border-neutral-400"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-neutral-300" />
              Stop
            </button>
          )}

          <div className="font-mono text-sm text-neutral-400">
            {clock(elapsed)}
            {recording && <span className="ml-2 text-red-400">● recording</span>}
          </div>

          {recording && mode === "voice" && lines.length > 0 && (
            <span className="text-xs text-neutral-600">live captions captured as a fallback</span>
          )}
        </div>

        {!recording && take && (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-black/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Last take · {clock(take.seconds)}
              </span>
              <button
                type="button"
                onClick={clearTake}
                className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
              >
                Discard
              </button>
            </div>
            {mode === "screen" ? (
              <video src={take.url} controls playsInline className="max-h-64 w-full rounded-md bg-black" />
            ) : (
              <audio src={take.url} controls className="w-full" />
            )}
            <p className="mt-2 text-xs text-neutral-600">
              Listen back before saving — it is transcribed on the server when you do.
            </p>
          </div>
        )}

        {mode === "voice" && (lines.length > 0 || interim) && !take && (
          <div className="scroll-thin mt-3 h-40 overflow-y-auto rounded-md border border-neutral-900 bg-black/40 p-3 text-sm leading-relaxed">
            {lines.map((line, i) => (
              <p key={i} className="text-neutral-300">
                <span className="mr-2 font-mono text-[11px] text-neutral-600">{clock(line.at)}</span>
                <span className="text-teal-300">{userName}:</span> {line.text}
              </p>
            ))}
            {interim && <p className="text-neutral-500">{interim}</p>}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={submitting || recording || !take}
          className="rounded-md bg-teal-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {submitting ? "Transcribing & summarising…" : "Transcribe & save"}
        </button>
        <span className="text-xs text-neutral-600">
          {take
            ? "The recording is transcribed on this server (local whisper), then summarised."
            : "Stop the recording first — you can listen to it before saving."}
        </span>
      </div>
    </section>
  );
}
