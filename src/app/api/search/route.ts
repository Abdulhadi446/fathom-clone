import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/queries";
import { hitHref } from "@/components/dashboard/hits";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<term>&limit=<n> — cross-meeting search over meeting
 * titles, transcript text and summary content (owner: agent B).
 *
 * Transcript hits deep-link to `/meetings/[id]?t=<seconds>` so the meeting
 * page can seek to the matching line (documented in .agent-logs/003).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const rawLimit = Number(params.get("limit"));
  const limit = Number.isFinite(rawLimit) && params.get("limit") !== null
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 60)
    : 60;

  if (q.length < 2) {
    return NextResponse.json({ query: q, count: 0, hits: [] });
  }

  try {
    const hits = searchAll(q, limit).map((h) => ({
      kind: h.kind,
      meetingId: h.meetingId,
      meetingTitle: h.meetingTitle,
      startedAt: h.startedAt.toISOString(),
      field: h.field,
      excerpt: h.excerpt,
      segmentId: h.segmentId,
      startTime: h.startTime,
      href: hitHref(h),
    }));
    return NextResponse.json({ query: q, count: hits.length, hits });
  } catch (err) {
    return NextResponse.json({ query: q, count: 0, hits: [], error: String(err) }, { status: 500 });
  }
}
