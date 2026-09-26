import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, users } from "@/db/schema";
import { destroySession, rateLimit, verifyPassword } from "@/lib/auth";
import { badRequest, clientIp, withUser } from "@/lib/auth-http";
import { removeMeetingAudio } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account — { password }  (account deletion, deliberately explicit)
 *
 * Verifies the password (a stolen session alone cannot destroy the account),
 * removes the stored recordings, then deletes the user row. `ON DELETE CASCADE`
 * takes sessions, auth tokens, meetings, transcript, summaries, action items
 * and highlights with it.
 */
export async function DELETE(request: Request) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return badRequest("Confirm your password to delete the account.");

  if (!rateLimit(`delete:${user.id}`) || !rateLimit(`delete:${clientIp(request)}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const row = db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return badRequest("Password is incorrect.");
  }

  const audioFiles = db
    .select({ audioPath: meetings.audioPath })
    .from(meetings)
    .where(eq(meetings.userId, user.id))
    .all()
    .map((m) => m.audioPath)
    .filter((v): v is string => Boolean(v));

  db.delete(users).where(eq(users.id, user.id)).run();
  await Promise.all(audioFiles.map((file) => removeMeetingAudio(file)));
  await destroySession();

  return NextResponse.json({ ok: true });
}
