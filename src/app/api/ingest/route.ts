import { NextResponse } from "next/server";
import { db } from "@/db";
import { actionItems, meetings, summaries, transcriptSegments } from "@/db/schema";
import { ensureDemoUser } from "@/lib/queries";
import {
  summarizeMeeting,
  type SummarizeResult,
  type TemplateId,
} from "@/lib/summarize";
import { parseTranscript } from "./parse";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest — demo-mode ingest (agent D).
 *
 * The CAPTURE layer is simulated (the user pastes a transcript), the PROCESSING
 * layer is real: the same `summarizeMeeting()` used for the seeded meetings runs
 * here for the `standard` + `exec-brief` templates, and the resulting Meeting /
 * TranscriptSegment / Summary / ActionItem rows are indistinguishable from seed
 * data apart from `Meeting.source = "demo"`.
 */

const MAX_CHARS = 60_000;
const TEMPLATES: TemplateId[] = ["standard", "exec-brief"];
const MAX_ACTION_ITEMS = 4;

interface IngestBody {
  title?: unknown;
  transcript?: unknown;
  startedAt?: unknown;
  participants?: unknown;
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as IngestBody | null;
  if (!body) return bad("Expected a JSON body.");

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return bad("Give the meeting a title.");

  const raw = typeof body.transcript === "string" ? body.transcript : "";
  if (!raw.trim()) return bad("Paste a transcript to ingest — the textarea is empty.");
  if (raw.length > MAX_CHARS) {
    return bad(
      `Transcript is too long (${raw.length.toLocaleString()} characters). Paste at most ${MAX_CHARS.toLocaleString()}.`,
    );
  }

  const parsed = parseTranscript(raw);
  if (!parsed.ok) return bad(parsed.error);

  const { segments, speakers, truncated } = parsed.transcript;
  const derivedSpeakers = speakers.filter((s) => s !== "Speaker");
  const fallback = derivedSpeakers.length ? derivedSpeakers : speakers;
  const participantList = parseParticipants(body.participants, fallback);
  const startedAt = parseStartedAt(body.startedAt);
  const durationSeconds = Math.max(30, Math.ceil(segments[segments.length - 1].endTime));

  const meetingId = `m_demo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  try {
    const user = ensureDemoUser();

    db.insert(meetings)
      .values({
        id: meetingId,
        title,
        startedAt,
        durationSeconds,
        participants: participantList,
        source: "demo",
        userId: user.id,
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
    return NextResponse.json(
      { error: "Something went wrong creating the meeting — please try again." },
      { status: 500 },
    );
  }
}
