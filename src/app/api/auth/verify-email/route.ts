import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { rateLimit } from "@/lib/auth";
import { badRequest, clientIp } from "@/lib/auth-http";
import { consumeAuthToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify-email — { token } from the emailed link.
 * Burns the single-use token and stamps `User.email_verified_at`.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return badRequest("Missing verification token.");
  if (!rateLimit(`verify:${clientIp(request)}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const userId = consumeAuthToken(token, "verify_email");
  if (!userId) {
    return NextResponse.json(
      { error: "This verification link is invalid or has already been used." },
      { status: 400 },
    );
  }
  db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId)).run();
  return NextResponse.json({ ok: true });
}
