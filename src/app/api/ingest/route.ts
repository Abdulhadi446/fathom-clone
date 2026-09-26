import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/db";
import { actionItems, meetings, summaries, transcriptSegments } from "@/db/schema";
import { withUser } from "@/lib/auth-http";
import { removeMeetingAudio, resolveAudioPath, saveMeetingAudio } from "@/lib/uploads";
import { segmentsToTranscript, transcribeAudio, type SttResult } from "@/lib/stt";
import {
  summarizeMeeting,
  type SummarizeResult,
  type TemplateId,
} from "@/lib/summarize";
import { parseTranscript } from "./parse";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest — bring a meeting in.
 *
 * Capture is real (pasted text, an uploaded .txt/.vtt/.srt file, or a mic/screen
 * recording from the browser), processing is real: the shared
 * `summarizeMeeting()` runs the `standard` + `exec-brief` templates and writes
 * Meeting / TranscriptSegment / Summary / ActionItem rows owned by the
 * signed-in user.
 *
 * Audio with no pasted transcript is transcribed **on this machine** by
 * `src/lib/stt.ts` (faster-whisper, no cloud STT) before summarizing. A pasted
 * transcript always wins over transcription.
 *
 * Accepts JSON or multipart/form-data (multipart carries an `audio` File when
 * the meeting was recorded in the browser).
 */

const MAX_CHARS = 60_000;
const TEMPLATES: TemplateId[] = ["standard", "exec-brief"];
const MAX_ACTION_ITEMS = 4;

interface IngestBody {
  title?: unknown;
  transcript?: unknown;
  /** Live browser speech-to-text captured while recording — used only if the
   *  server-side transcription of the same recording fails. */
  fallback?: unknown;
  startedAt?: unknown;
  participants?: unknown;
  audio?: File;
  /** "video" when the recording is a screen capture */
  kind?: unknown;
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseParticipants(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : typeof value === "string"
      ? value
          .split(/[,;\n]/)
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
  const base = list.length ? list : fallback;
  return [...new Set(base)].slice(0, 40);
}

function parseStartedAt(value: unknown): Date {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      if (year >= 2000 && year <= 2100) return parsed;
    }
  }
  return new Date();
}

function mergeActionItems(results: SummarizeResult[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    for (const item of result.actionItems) {
      const text = item.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      merged.push(text);
      if (merged.length >= MAX_ACTION_ITEMS) return merged;
    }
  }
  return merged;
}

async function readBody(req: Request): Promise<IngestBody | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return null;
    const audio = form.get("audio");
    return {
      title: form.get("title"),
      transcript: form.get("transcript"),
      fallback: form.get("fallback"),
      startedAt: form.get("startedAt"),
      participants: form.get("participants"),
      kind: form.get("kind"),
      audio: audio instanceof File ? audio : undefined,
    };
  }
  return (await req.json().catch(() => null)) as IngestBody | null;
}

export async function POST(req: Request) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;

  const body = await readBody(req);
  if (!body) return bad("Expected a JSON or multipart body.");

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return bad("Give the meeting a title.");

  const hasAudio = Boolean(body.audio && body.audio.size > 0);
  let raw = typeof body.transcript === "string" ? body.transcript : "";
  if (!raw.trim() && !hasAudio) {
    return bad("Paste a transcript or attach a recording — there is nothing to ingest.");
  }
  if (raw.length > MAX_CHARS) {
    return bad(
      `Transcript is too long (${raw.length.toLocaleString()} characters). Paste at most ${MAX_CHARS.toLocaleString()}.`,
    );
  }

  const meetingId = `m_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // Audio is stored before parsing so a recording can be transcribed locally.
  const isVideo = typeof body.kind === "string" && body.kind === "video";
  let audioPath: string | null = null;
  if (hasAudio && body.audio) {
    const saved = await saveMeetingAudio(meetingId, body.audio);
    if (saved.ok) audioPath = saved.filename;
    else return bad(saved.error);
  }

  let stt: SttResult | null = null;
  if (!raw.trim() && audioPath) {
    const file = resolveAudioPath(audioPath);
    stt = file ? await transcribeAudio(file) : { ok: false, error: "stored audio file is missing" };
    if (stt.ok) {
      raw = segmentsToTranscript(stt.segments, user.name);
    } else {
      // Fall back to whatever the browser heard while recording.
      const live = typeof body.fallback === "string" ? body.fallback.trim() : "";
      if (live) {
        raw = live;
      } else {
        await removeMeetingAudio(audioPath);
        return NextResponse.json(
          {
            error: `Couldn't transcribe this recording on the server (${stt.error}). Try again, or paste a transcript instead.`,
          },
          { status: 422 },
        );
      }
    }
  }

  const parsed = parseTranscript(raw);
  if (!parsed.ok) return bad(parsed.error);

  const { segments, speakers, truncated } = parsed.transcript;
  const derivedSpeakers = speakers.filter((s) => s !== "Speaker");
  const fallback = derivedSpeakers.length ? derivedSpeakers : speakers;
  const participantList = parseParticipants(body.participants, fallback);
  const startedAt = parseStartedAt(body.startedAt);
  const durationSeconds = Math.max(30, Math.ceil(segments[segments.length - 1].endTime));

  try {
    db.insert(meetings)
      .values({
        id: meetingId,
        title,
        startedAt,
        durationSeconds,
        participants: participantList,
        source: audioPath ? "recorded" : "transcript",
        userId: user.id,
        audioPath,
        hasVideo: isVideo,
      })
      .run();

    db.insert(transcriptSegments)
      .values(
        segments.map((segment, i) => ({
          id: `seg_${meetingId}_${i}`,
          meetingId,
          speaker: segment.speaker,
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
        })),
      )
      .run();

    let results: SummarizeResult[] = [];
    let warning: string | null = truncated
      ? `Only the first ${segments.length.toLocaleString()} lines were ingested.`
      : null;

    try {
      results = await Promise.all(
        TEMPLATES.map((template) =>
          summarizeMeeting(
            { title, startedAt, durationSeconds, participants: participantList, segments },
            template,
          ),
        ),
      );
    } catch (err) {
      console.error("[ingest] summarizer threw:", err);
      warning = "The meeting was created but summaries could not be generated — try again later.";
    }

    results.forEach((result, i) => {
      db.insert(summaries)
        .values({
          id: `sum_${meetingId}_${i}`,
          meetingId,
          template: result.template,
          content: result.content,
          createdAt: new Date(),
        })
        .run();
    });

    const actionTexts = mergeActionItems(results);
    if (actionTexts.length) {
      db.insert(actionItems)
        .values(
          actionTexts.map((text, i) => ({
            id: `act_${meetingId}_${i}`,
            meetingId,
            text,
            done: false,
            sortOrder: i,
            createdAt: new Date(),
          })),
        )
        .run();
    }

    const generator = !results.length
      ? "none"
      : results.every((r) => r.source === "llm")
        ? "llm"
        : results.some((r) => r.source === "llm")
          ? "mixed"
          : "fallback";

    return NextResponse.json({
      meetingId,
      link: `/meetings/${meetingId}`,
      title,
      startedAt: startedAt.toISOString(),
      durationSeconds,
      participants: participantList,
      segmentCount: segments.length,
      usedTimestamps: parsed.transcript.usedTimestamps,
      transcribed: stt?.ok === true,
      transcription: stt?.ok
        ? { engine: "local-whisper", language: stt.language, audioSeconds: stt.durationSeconds }
        : null,
      summaries: results.map((r) => ({
        template: r.template,
        source: r.source,
        actionItems: r.actionItems.length,
      })),
      actionItemCount: actionTexts.length,
      generator,
      warning,
    });
  } catch (err) {
    console.error("[ingest] failed:", err);
    if (audioPath) await removeMeetingAudio(audioPath);
    return NextResponse.json(
      { error: "Something went wrong creating the meeting — please try again." },
      { status: 500 },
    );
  }
}
