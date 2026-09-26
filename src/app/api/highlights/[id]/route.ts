import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { highlights, meetings } from "@/db/schema";
import { serializeHighlight, newShareSlug } from "../share";
import { withUser } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_NOTE = 500;

/**
 * PATCH /api/highlights/[id] — edit a highlight.
 * Body (all optional):
 *   note           string | null   — replace the caption (null clears it)
 *   isPublic       boolean         — true: share (mints a slug if missing);
 *                                    false: revoke (clears the slug)
 *   regenerateSlug boolean         — mint a fresh slug (old clip links die)
 *   clearSlug      boolean         — drop the slug (implies isPublic: false)
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const input = (body ?? {}) as {
    note?: unknown;
    isPublic?: unknown;
    regenerateSlug?: unknown;
    clearSlug?: unknown;
  };

  const found = db
    .select({ highlight: highlights, owner: meetings.userId })
    .from(highlights)
    .innerJoin(meetings, eq(highlights.meetingId, meetings.id))
    .where(eq(highlights.id, id))
    .get();
  if (!found || found.owner !== user.id) {
    return NextResponse.json({ error: "highlight not found" }, { status: 404 });
  }
  const existing = found.highlight;

  const patch: Partial<typeof highlights.$inferInsert> = {};

  if (input.note !== undefined) {
    patch.note =
      input.note === null ? null : String(input.note).trim().slice(0, MAX_NOTE) || null;
  }

  const wantsRegenerate = input.regenerateSlug === true;
  const wantsClear = input.clearSlug === true;
  const wantsPublic =
    input.isPublic === undefined ? undefined : input.isPublic === true || input.isPublic === 1;

  if (wantsClear) {
    patch.shareSlug = null;
    patch.isPublic = false;
  } else if (wantsRegenerate) {
    patch.shareSlug = newShareSlug();
  } else if (wantsPublic === true) {
    // share on → make sure a slug exists
    if (!existing.shareSlug) patch.shareSlug = newShareSlug();
    patch.isPublic = true;
  } else if (wantsPublic === false) {
    // share off → flip the flag and revoke the link
    patch.isPublic = false;
    patch.shareSlug = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ highlight: serializeHighlight(existing) });
  }

  let updated: (typeof highlights.$inferSelect) | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 6 && !updated; attempt++) {
    try {
      updated = db.update(highlights).set(patch).where(eq(highlights.id, id)).returning().get();
    } catch (err) {
      lastError = err;
      if (!patch.shareSlug || !String(err).includes("UNIQUE")) throw err;
      patch.shareSlug = newShareSlug();
    }
  }
  if (!updated) {
    if (lastError) throw lastError;
    return NextResponse.json({ error: "highlight not found" }, { status: 404 });
  }

  return NextResponse.json({ highlight: serializeHighlight(updated) });
}

/** DELETE /api/highlights/[id] — remove a highlight (and any public clip). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const owned = db
    .select({ id: highlights.id })
    .from(highlights)
    .innerJoin(meetings, eq(highlights.meetingId, meetings.id))
    .where(and(eq(highlights.id, id), eq(meetings.userId, user.id)))
    .get();
  if (!owned) {
    return NextResponse.json({ error: "highlight not found" }, { status: 404 });
  }
  const deleted = db.delete(highlights).where(eq(highlights.id, id)).returning().get();
  if (!deleted) {
    return NextResponse.json({ error: "highlight not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: deleted.id });
}
