import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * On-box speech-to-text (no API key, no cloud).
 *
 * `ops/stt/transcribe.py` runs faster-whisper from /srv/fathom/stt (see
 * ops/install-stt.sh) and prints JSON segments on stdout. Set STT_BIN /
 * STT_SCRIPT to relocate it.
 */

export interface SttSegment {
  start: number;
  end: number;
  text: string;
}

export interface SttSuccess {
  ok: true;
  segments: SttSegment[];
  language: string;
  durationSeconds: number;
}

export interface SttFailure {
  ok: false;
  error: string;
}

export type SttResult = SttSuccess | SttFailure;

const TIMEOUT_MS = 1000 * 60 * 10;

function pythonBin(): string {
  return process.env.STT_BIN || "/srv/fathom/stt/bin/python";
}

function scriptPath(): string {
  if (process.env.STT_SCRIPT) return process.env.STT_SCRIPT;
  const local = path.join(process.cwd(), "ops/stt/transcribe.py");
  if (fs.existsSync(local)) return local;
  return "/srv/fathom/stt/transcribe.py";
}

export function sttAvailable(): boolean {
  try {
    return fs.existsSync(pythonBin()) && fs.existsSync(scriptPath());
  } catch {
    return false;
  }
}

/** Serialise transcriptions — the box is small and the model is memory-hungry. */
let queue: Promise<unknown> = Promise.resolve();

export function transcribeAudio(filePath: string): Promise<SttResult> {
  const run = queue.then(() => transcribeOnce(filePath));
  queue = run.catch(() => undefined);
  return run;
}

function transcribeOnce(filePath: string): Promise<SttResult> {
  if (!sttAvailable()) {
    return Promise.resolve({
      ok: false,
      error: "local speech-to-text is not installed on this server (ops/install-stt.sh)",
    });
  }
  return new Promise<SttResult>((resolve) => {
    const args = [scriptPath(), filePath];
    const child = spawn(pythonBin(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, error: "transcription timed out" });
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.length > 4_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-4_000);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `could not start transcriber: ${error.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: err.trim() || `transcriber exited with ${code}` });
        return;
      }
      try {
        const parsed = JSON.parse(out) as {
          language?: string;
          duration?: number;
          segments?: SttSegment[];
        };
        const segments = (parsed.segments ?? []).filter((s) => s && typeof s.text === "string");
        if (segments.length === 0) {
          resolve({ ok: false, error: "no speech detected in the recording" });
          return;
        }
        resolve({
          ok: true,
          segments,
          language: parsed.language ?? "unknown",
          durationSeconds: Math.round(parsed.duration ?? segments[segments.length - 1]?.end ?? 0),
        });
      } catch {
        resolve({ ok: false, error: `unexpected transcriber output: ${out.slice(0, 200)}` });
      }
    });
  });
}

/** `[mm:ss] Speaker: text` lines — the exact shape summarize/ingest already parse. */
export function segmentsToTranscript(segments: SttSegment[], speaker: string): string {
  const label = speaker.trim() || "Speaker";
  return segments
    .map((segment) => {
      const total = Math.max(0, Math.floor(segment.start));
      const mm = String(Math.floor(total / 60)).padStart(2, "0");
      const ss = String(total % 60).padStart(2, "0");
      const text = segment.text.trim();
      return text ? `[${mm}:${ss}] ${label}: ${text}` : null;
    })
    .filter(Boolean)
    .join("\n");
}
