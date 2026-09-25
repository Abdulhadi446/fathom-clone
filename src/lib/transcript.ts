import { chatJSON, type ChatMessage } from "./llm";
import type { TranscriptLine } from "./summarize";

/**
 * LLM-backed transcript authoring for seed data.
 *
 * Generates realistic multi-speaker meeting transcripts in time-windowed
 * chunks so a 60-minute, 8-person meeting comes out long and dense enough to
 * stress-test the transcript UI. Output is cached to disk by the seed script.
 */

export interface TranscriptSpec {
  title: string;
  context: string;
  durationSeconds: number;
  people: { name: string; role: string }[];
  /** How many lines the whole meeting should aim for. */
  targetLines: number;
  /** Seconds per generation chunk. */
  chunkSeconds?: number;
}

const SYSTEM = `You write realistic, verbatim meeting transcripts for product demo data.
Rules:
- Output a JSON array only. Each item: {"speaker":"<name>","startTime":<seconds>,"endTime":<seconds>,"text":"<utterance>"}
- Utterances are natural spoken language: contractions, occasional filler ("yeah", "right"), short self-corrections. Never markdown, never stage directions, never "Speaker 1".
- 4-40 words per utterance. Vary length a lot; some are 3 words.
- Times are seconds from the start of the meeting, strictly inside the requested window, non-decreasing, and startTime < endTime.
- Only use the given participants. Do not make everyone speak in every window.
- Continuity: pick up the conversation naturally from the context given. Do not re-introduce the topic.`;

async function generateChunk(
  spec: TranscriptSpec,
  windowStart: number,
  windowEnd: number,
  windowLines: number,
  context: string,
): Promise<TranscriptLine[]> {
  const people = spec.people.map((p) => `${p.name} — ${p.role}`).join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Meeting: ${spec.title}
Context: ${spec.context}
Duration so far target: ${spec.durationSeconds}s total.

Participants:
${people}

${context ? `Conversation so far (last lines):\n${context}\n\n` : ""}Write the lines spoken between t=${windowStart}s and t=${windowEnd}s (inclusive).
Produce approximately ${windowLines} utterances spread across that window.
The first utterance must start at or after ${windowStart}s and the last must end at or before ${windowEnd}s.`,
    },
  ];

  const parsed = await chatJSON<unknown>(messages, { maxTokens: 5000, temperature: 0.8 });
  return coerceLines(parsed, windowStart, windowEnd, spec.people.map((p) => p.name));
}

function coerceLines(
  raw: unknown,
  windowStart: number,
  windowEnd: number,
  allowed: string[],
): TranscriptLine[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { segments?: unknown })?.segments)
      ? ((raw as { segments: unknown[] }).segments)
      : Array.isArray((raw as { lines?: unknown })?.lines)
        ? ((raw as { lines: unknown[] }).lines)
        : [];

  const out: TranscriptLine[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const speaker = String(o.speaker ?? "").trim();
    const text = String(o.text ?? o.utterance ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || !speaker) continue;
    const match = allowed.find(
      (a) => a.toLowerCase() === speaker.toLowerCase() || a.toLowerCase().startsWith(speaker.toLowerCase()),
    );
    const resolved = match ?? (allowed.includes(speaker) ? speaker : null);
    if (!resolved) continue;
    let start = Number(o.startTime ?? o.start ?? NaN);
    let end = Number(o.endTime ?? o.end ?? NaN);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end) || end <= start) end = start + Math.min(20, Math.max(4, text.length / 14));
    start = Math.min(Math.max(start, windowStart), windowEnd);
    end = Math.min(Math.max(end, start + 1.5), windowEnd + 5);
    out.push({ speaker: resolved, text, startTime: start, endTime: end });
  }
  return out.sort((a, b) => a.startTime - b.startTime);
}

/** Merge chunks, de-overlap times, clamp to the meeting duration. */
export function normalizeTranscript(lines: TranscriptLine[], durationSeconds: number): TranscriptLine[] {
  const sorted = [...lines].sort((a, b) => a.startTime - b.startTime);
  const out: TranscriptLine[] = [];
  for (const line of sorted) {
    if (!line.text.trim()) continue;
    const prev = out[out.length - 1];
    const start = prev ? Math.max(line.startTime, prev.endTime) : Math.max(0, line.startTime);
    if (start > durationSeconds) break;
    let end = Math.max(line.endTime, start + 2);
    if (end > durationSeconds) end = durationSeconds;
    if (end <= start) break;
    out.push({ speaker: line.speaker, text: line.text, startTime: start, endTime: end });
  }
  return out;
}

export async function generateTranscript(spec: TranscriptSpec): Promise<TranscriptLine[]> {
  const chunkSeconds = spec.chunkSeconds ?? Math.min(900, Math.max(600, spec.durationSeconds));
  const chunks = Math.max(1, Math.ceil(spec.durationSeconds / chunkSeconds));
  const linesPerChunk = Math.max(6, Math.round(spec.targetLines / chunks));

  const collected: TranscriptLine[] = [];
  let context = "";
  for (let i = 0; i < chunks; i++) {
    const start = Math.floor(i * (spec.durationSeconds / chunks));
    const end = Math.floor((i + 1) * (spec.durationSeconds / chunks));
    const lines = await generateChunk(spec, start, end, linesPerChunk, context);
    if (lines.length === 0) {
      throw new Error(`Transcript chunk ${i} returned no lines`);
    }
    collected.push(...lines);
    context = lines
      .slice(-8)
      .map((l) => `${fmt(l.startTime)} ${l.speaker}: ${l.text}`)
      .join("\n");
    if (i < chunks - 1) await new Promise((r) => setTimeout(r, 250));
  }

  return normalizeTranscript(collected, spec.durationSeconds);
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
