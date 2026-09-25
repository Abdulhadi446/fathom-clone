/**
 * Transcript parsing for the demo-mode ingest flow (agent D).
 *
 * Forgiving by design — the accepted shapes are documented in the UI
 * (`/ingest`). Per line we recognise:
 *
 *   00:03 Priya: we should ship the search fix on Thursday   (timestamp + speaker)
 *   [12:04] Priya: …                                         (bracketed timestamp)
 *   Priya: …                                                 (speaker only)
 *
 * Anything else continues the previous speaker's utterance, so a pasted
 * paragraph without labels still ingests. Lines without a usable timestamp get
 * synthetic times derived from their length, which keeps the transcript
 * timeline sane for the player.
 */

export interface ParsedSegment {
  speaker: string;
  text: string;
  /** seconds from meeting start */
  startTime: number;
  /** seconds from meeting start */
  endTime: number;
}

export interface ParsedTranscript {
  segments: ParsedSegment[];
  speakers: string[];
  chars: number;
  usedTimestamps: boolean;
  truncated: boolean;
}

export type ParseOutcome =
  | { ok: true; transcript: ParsedTranscript }
  | { ok: false; error: string };

const MAX_SEGMENTS = 600;
const MIN_CHARS = 40;
const FALLBACK_SPEAKER = "Speaker";

const TIMESTAMP = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?(?=$|[\s\]\[-])/;
const SPEAKER_LINE = /^([^:\n]{1,60}):\s+(.*)$/;
const SEPARATOR = /^(-{3,}|={3,}|\*{3,}|_{3,}|#{1,6})\s*$/;

interface Row {
  speaker: string;
  text: string;
  ts: number | null;
}

function parseClock(raw: string): number | null {
  const parts = raw.replace(",", ".").split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    if (m > 180 || s > 59) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h > 24 || m > 59 || s > 59) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

/** Guards against "and then: we ship" style lines being read as a new speaker. */
function looksLikeSpeaker(label: string, lastSpeaker: string): boolean {
  if (!label || label.length > 40) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9 .'\-_()@#&+/]*$/.test(label)) return false;
  if (/\.$/.test(label) || label.includes("  ")) return false;
  if (lastSpeaker && /^[a-z]/.test(label)) return false;
  return true;
}

/** ~156 words per minute, clamped so a lone word still renders. */
function estimateSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(60, Math.max(2, words / 2.6));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function assignTimes(rows: Row[], usedTimestamps: boolean): ParsedSegment[] {
  const starts: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const prevStart = starts[i - 1];
    const prevDuration = i > 0 ? estimateSeconds(rows[i - 1].text) : 0;
    const ts = rows[i].ts;
    let start: number;
    if (usedTimestamps && ts !== null && (prevStart === undefined || ts > prevStart)) {
      start = ts;
    } else if (prevStart !== undefined) {
      start = prevStart + prevDuration + 0.4;
    } else {
      start = 0;
    }
    if (prevStart !== undefined && start < prevStart + 0.3) start = prevStart + 0.3;
    starts.push(round1(start));
  }

  return rows.map((row, i) => {
    const startTime = starts[i];
    const endCandidate =
      i + 1 < rows.length ? starts[i + 1] : startTime + estimateSeconds(row.text);
    return {
      speaker: row.speaker,
      text: row.text,
      startTime,
      endTime: Math.max(round1(endCandidate), round1(startTime + 0.3)),
    };
  });
}

export function parseTranscript(raw: unknown): ParseOutcome {
  const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n") : "";
  const flat = text.replace(/\s+/g, " ").trim();

  if (!flat) {
    return { ok: false, error: "The transcript is empty — paste some dialogue to continue." };
  }
  if (!/[a-zA-Z]/.test(flat)) {
    return {
      ok: false,
      error: "That doesn't look like a transcript — there's no readable text in it.",
    };
  }
  if (flat.length < MIN_CHARS) {
    return {
      ok: false,
      error: `That's too short to summarize. Paste at least a few lines of dialogue (${MIN_CHARS}+ characters).`,
    };
  }

  const rows: Row[] = [];
  let lastSpeaker = "";
  let timestamped = 0;
  let truncated = false;

  for (const rawLine of text.split("\n")) {
    if (rows.length >= MAX_SEGMENTS) {
      truncated = true;
      break;
    }
    const line = rawLine.trim();
    if (!line || SEPARATOR.test(line)) continue;

    let rest = line;
    let ts: number | null = null;
    const tsMatch = TIMESTAMP.exec(line);
    if (tsMatch) {
      const parsed = parseClock(tsMatch[1]);
      if (parsed !== null) {
        ts = parsed;
        rest = line.slice(tsMatch[0].length).trim();
        if (!rest) continue;
      }
    }

    let speaker = lastSpeaker || FALLBACK_SPEAKER;
    let utterance = rest;
    const speakerMatch = SPEAKER_LINE.exec(rest);
    if (speakerMatch && speakerMatch[2].trim()) {
      const label = speakerMatch[1].trim();
      if (looksLikeSpeaker(label, lastSpeaker)) {
        speaker = label;
        utterance = speakerMatch[2].trim();
        lastSpeaker = label;
      }
    }

    if (!utterance) continue;
    if (ts !== null) timestamped++;
    rows.push({ speaker, text: utterance, ts });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        'Couldn\'t find any usable lines. Try lines like "00:03 Priya: we should ship Thursday" or "Priya: …".',
    };
  }

  const usedTimestamps = timestamped >= Math.ceil(rows.length / 2);
  const segments = assignTimes(rows, usedTimestamps);
  const speakers = [...new Set(segments.map((s) => s.speaker))];

  return {
    ok: true,
    transcript: { segments, speakers, chars: flat.length, usedTimestamps, truncated },
  };
}
