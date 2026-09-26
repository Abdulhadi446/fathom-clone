import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, rateLimit, verifyPassword } from "@/lib/auth";
import { badRequest, clientIp, readPassword, withUser } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password — { currentPassword, newPassword }
 * Signed-in users only; the current password is required so a stolen session
 * cannot silently lock the owner out.
 */
export async function POST(request: Request) {
  const user = await withUser();
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = readPassword(body?.newPassword);
  if (!current || !next) return badRequest("Current and new passwords are required (8+ characters).");

  if (!rateLimit(`password:${user.id}`) || !rateLimit(`password:${clientIp(request)}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const row = db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return badRequest("Current password is incorrect.");
  }

  db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id)).run();
  return NextResponse.json({ ok: true });
}
