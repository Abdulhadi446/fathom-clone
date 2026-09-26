import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { actionItems } from "@/db/schema";
import { getOwnedMeeting } from "@/lib/queries";
import { withUser } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

interface PatchBody {
  id?: unknown;
  done?: unknown;
  items?: unknown;
}

/**
 * GET /api/meetings/[id]/action-items — the meeting's items for its owner.
 * 404 for anyone else, so the id space never leaks across accounts.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;

  const { id: meetingId } = await params;
  if (!meetingId) {
    return NextResponse.json({ error: "meeting id is required" }, { status: 400 });
  }
  if (!getOwnedMeeting(meetingId, user.id)) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const rows = db
    .select({
      id: actionItems.id,
      text: actionItems.text,
      done: actionItems.done,
      sortOrder: actionItems.sortOrder,
    })
    .from(actionItems)
    .where(eq(actionItems.meetingId, meetingId))
    .all();

  return NextResponse.json({
    items: rows,
    doneCount: rows.filter((row) => row.done).length,
    totalCount: rows.length,
  });
}

/**
 * PATCH /api/meetings/[id]/action-items
 * Owner: agent A (meeting detail).
 *
 * Body: `{ id, done }` for a single toggle, or `{ items: [{ id, done }] }`.
 * Every row must belong to the meeting in the URL — otherwise 404.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;

  const { id: meetingId } = await params;
  if (!meetingId) {
    return NextResponse.json({ error: "meeting id is required" }, { status: 400 });
  }
  if (!getOwnedMeeting(meetingId, user.id)) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const updates: { id: string; done: boolean }[] = [];
  if (Array.isArray(body.items)) {
    for (const entry of body.items) {
      const item = entry as { id?: unknown; done?: unknown };
      if (typeof item?.id !== "string" || typeof item?.done !== "boolean") {
        return NextResponse.json({ error: "each item needs { id: string, done: boolean }" }, { status: 400 });
      }
      updates.push({ id: item.id, done: item.done });
    }
  } else if (typeof body.id === "string" && typeof body.done === "boolean") {
    updates.push({ id: body.id, done: body.done });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "expected { id, done } or { items: [{ id, done }] }" }, { status: 400 });
  }

  const updated: { id: string; done: boolean }[] = [];
  for (const update of updates) {
    const row = db
      .update(actionItems)
      .set({ done: update.done })
      .where(and(eq(actionItems.id, update.id), eq(actionItems.meetingId, meetingId)))
      .returning({ id: actionItems.id, done: actionItems.done })
      .get();

    if (!row) {
      return NextResponse.json(
        { error: `action item ${update.id} does not belong to meeting ${meetingId}` },
        { status: 404 },
      );
    }
    updated.push(row);
  }

  const remaining = db
    .select({ id: actionItems.id, done: actionItems.done })
    .from(actionItems)
    .where(eq(actionItems.meetingId, meetingId))
    .all();

  return NextResponse.json({
    items: updated,
    doneCount: remaining.filter((row) => row.done).length,
    totalCount: remaining.length,
  });
}
