import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { highlights } from "@/db/schema";
import { getHighlights, getMeeting, getSegments } from "@/lib/queries";
import { serializeHighlight } from "./share";

export const dynamic = "force-dynamic";

/**
 * GET /api/highlights?meetingId=<id> — every highlight for one meeting,
 * earliest first. Used by HighlightBar to load its inline list.
 */
export async function GET(request: Request) {
  const meetingId = new URL(request.url).searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }
  const rows = getHighlights(meetingId);
  return NextResponse.json({ highlights: rows.map(serializeHighlight) });
}

const MAX_NOTE = 500;
const DEFAULT_RANGE_SECONDS = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Trimmed excerpt of the transcript covering [start, end] — the default note. */
function excerptFromTranscript(meetingId: string, start: number, end: number, max = 160): string | null {
  const segments = getSegments(meetingId);
  const overlapping = segments.filter((s) => s.endTime > start && s.startTime < end);
  const source = overlapping.length > 0 ? overlapping : segments.filter((s) => s.startTime >= start).slice(0, 2);
  const text = source
    .map((s) => s.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * POST /api/highlights — create a highlight.
 * Body: { meetingId, startTime, endTime, note? }  (seconds; note defaults to a
 * trimmed transcript excerpt covering the range).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { meetingId, startTime, endTime, note } = (body ?? {}) as {
    meetingId?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    note?: unknown;
  };

  if (typeof meetingId !== "string" || !meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }
  const meeting = getMeeting(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const rawStart = Number(startTime);
  const rawEnd = Number(endTime);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return NextResponse.json({ error: "startTime and endTime must be numbers" }, { status: 400 });
  }

  const duration = Math.max(meeting.durationSeconds, 1);
  const start = clamp(rawStart, 0, duration);
  let end = clamp(rawEnd, 0, duration);
  if (end <= start) end = clamp(start + DEFAULT_RANGE_SECONDS, 0, duration);
  if (end <= start) {
    return NextResponse.json({ error: "invalid highlight range" }, { status: 400 });
  }

  const providedNote = typeof note === "string" ? note.trim().slice(0, MAX_NOTE) : "";
  const finalNote = providedNote || excerptFromTranscript(meetingId, start, end);

  const row = db
    .insert(highlights)
    .values({
      id: `hl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      meetingId,
      startTime: start,
      endTime: end,
      note: finalNote,
      shareSlug: null,
      isPublic: false,
    })
    .returning()
    .get();

  return NextResponse.json({ highlight: serializeHighlight(row) }, { status: 201 });
}
