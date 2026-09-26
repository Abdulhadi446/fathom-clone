import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, rateLimit } from "@/lib/auth";
import { badRequest, clientIp, readPassword } from "@/lib/auth-http";
import { clearAuthTokens, consumeAuthToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password — { token, password }
 * Consumes the single-use token, stores the new hash and signs every session
 * out (including any session an attacker may already hold).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    password?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = readPassword(body?.password);
  if (!token) return badRequest("Missing reset token.");
  if (!password) return badRequest("Password must be at least 8 characters.");

  if (!rateLimit(`reset:${clientIp(request)}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const userId = consumeAuthToken(token, "reset_password");
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
  clearAuthTokens(userId, "reset_password");
  clearAuthTokens(userId, "verify_email");

  return NextResponse.json({ ok: true });
}
