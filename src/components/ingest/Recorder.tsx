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

function defaultTitle(): string {
  const d = new Date();
  return `Meeting — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

/**
 * Record the microphone:
 *   speech  -> Web Speech API (in-browser recognition, no API key, Chrome/Edge)
 *   audio   -> MediaRecorder, uploaded alongside the transcript
 * The assembled `[m:ss] Name: text` transcript goes through the same
 * POST /api/ingest pipeline as a pasted one.
 */
export default function Recorder({ userName }: Props) {
  const SpeechEngine = useRef(speechEngine()).current;
  const [supported] = useState(() => !!SpeechEngine && mediaSupported());
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<FinalLine[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [others, setOthers] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const keepAliveRef = useRef(false);
  const linesRef = useRef<FinalLine[]>([]);
  const elapsedRef = useRef(0);

  useEffect(() => {
    return () => {
      keepAliveRef.current = false;
      recognitionRef.current?.abort?.();
      recorderRef.current?.stop?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setError(null);
    if (!supported) {
      setError(
        "This browser can't record — use Chrome or Edge, or switch to the paste/upload tab.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      const recognition = new SpeechEngine!();
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
      recognition.onerror = (event: { error?: string }) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          keepAliveRef.current = false;
          setError("Microphone or speech recognition was blocked by the browser.");
          setRecording(false);
        }
      };
      recognition.onend = () => {
        // Chrome stops after a pause — restart while the user is still recording.
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

      keepAliveRef.current = true;
      linesRef.current = [];
      setLines([]);
      setInterim("");
      startedAtRef.current = Date.now();
      elapsedRef.current = 0;
      setElapsed(0);
      setRecording(true);
    } catch {
      setError("Couldn't open the microphone — check browser permissions.");
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
    const finalLines = linesRef.current;
    if (!finalLines.length) {
      setError("Nothing was recognised yet — speak a few sentences first.");
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
        new Date(startedAtRef.current || Date.now() - elapsedRef.current * 1000).toISOString(),
      );
      const people = [userName, ...others.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)];
      body.set("participants", [...new Set(people)].join(", "));
      body.set(
        "transcript",
        finalLines.map((line) => `[${clock(line.at)}] ${userName}: ${line.text}`).join("\n"),
      );

      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: chunksRef.current[0].type || "audio/webm" })
        : null;
      if (blob && blob.size > 0) {
        body.set("audio", blob, "recording.webm");
      }

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
            onClick={() => {
              setResult(null);
              setLines([]);
              linesRef.current = [];
              setTitle(defaultTitle());
            }}
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

  if (!supported) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-400">
        Live recording needs <span className="text-neutral-200">Chrome</span> or{" "}
        <span className="text-neutral-200">Edge</span> (they ship the browser speech engine).
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
        <div className="flex flex-wrap items-center gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-md bg-red-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-400"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white" />
              Start recording
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

          {recording && (
            <span className="text-xs text-neutral-600">transcribed live in the browser</span>
          )}
        </div>

        <div className="scroll-thin mt-3 h-40 overflow-y-auto rounded-md border border-neutral-900 bg-black/40 p-3 text-sm leading-relaxed">
          {lines.length === 0 && !interim && (
            <p className="text-neutral-600">
              Recognised speech appears here as you talk. Nothing leaves the browser until you
              save.
            </p>
          )}
          {lines.map((line, i) => (
            <p key={i} className="text-neutral-300">
              <span className="mr-2 font-mono text-[11px] text-neutral-600">{clock(line.at)}</span>
              <span className="text-teal-300">{userName}:</span> {line.text}
            </p>
          ))}
          {interim && <p className="text-neutral-500">{interim}</p>}
        </div>
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
          disabled={submitting || recording || lines.length === 0}
          className="rounded-md bg-teal-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {submitting ? "Summarising…" : "Save & summarise"}
        </button>
        <span className="text-xs text-neutral-600">
          Stop the recording first — the transcript and audio are saved together.
        </span>
      </div>
    </section>
  );
}
