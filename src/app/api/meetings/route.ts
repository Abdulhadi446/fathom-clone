import { NextResponse } from "next/server";
import { listMeetingsWithSnippet } from "@/lib/queries";
import { withUser } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings — read endpoint for the signed-in user.
 * Returns *their* meetings newest-first with a summary snippet + counts.
 * Owner: foundation. Subagent B may extend; do not break the shape.
 */
export async function GET() {
  const user = await withUser();
  if (user instanceof NextResponse) return user;
  const rows = listMeetingsWithSnippet(user.id).map((m) => ({
    id: m.id,
    title: m.title,
    startedAt: m.startedAt.toISOString(),
    durationSeconds: m.durationSeconds,
    participants: m.participants,
    source: m.source,
    snippet: m.snippet,
    segmentCount: m.segmentCount,
    highlightCount: m.highlightCount,
  }));
  return NextResponse.json({ meetings: rows, count: rows.length });
}
