import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { highlights, meetings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { contentTypeFor, resolveAudioPath } from "@/lib/uploads";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * GET /api/audio/[id] — serve a meeting's recorded audio with HTTP Range
 * support so the <audio> element can seek.
 *
 * Access: the owner's session, or anyone when the meeting carries a public
 * highlight (that is what makes a shared `/clip/<slug>` playable).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get();
  if (!meeting || !meeting.audioPath) {
    return NextResponse.json({ error: "no audio for this meeting" }, { status: 404 });
  }

  const user = await getSessionUser();
  const isOwner = !!user && user.id === meeting.userId;
  const publicHighlight = db
    .select({ id: highlights.id })
    .from(highlights)
    .where(and(eq(highlights.meetingId, id), eq(highlights.isPublic, true)))
    .get();

  if (!isOwner && !publicHighlight) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const file = resolveAudioPath(meeting.audioPath);
  if (!file) return NextResponse.json({ error: "audio file missing" }, { status: 404 });

  const stat = await fs.stat(file);
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentTypeFor(path.basename(file), meeting.hasVideo),
    "Accept-Ranges": "bytes",
    "Cache-Control": `private, max-age=${MAX_AGE}`,
  };

  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match && (match[1] || match[2])) {
    const size = stat.size;
    const start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
    const length = end - start + 1;
    const handle = await fs.open(file, "r");
    const buffer = Buffer.alloc(length);
    try {
      await handle.read(buffer, 0, length, start);
    } finally {
      await handle.close();
    }
    return new Response(new Uint8Array(buffer), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const full = await fs.readFile(file);
  return new Response(new Uint8Array(full), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(stat.size) },
  });
}
