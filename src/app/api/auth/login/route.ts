import { NextResponse } from "next/server";
import { createSession, findUserByEmail, purgeExpiredSessions, rateLimit, verifyPassword } from "@/lib/auth";
import { badRequest, clientIp, tooMany, unauthorised } from "@/lib/auth-http";
import { purgeExpiredAuthTokens } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login — verify credentials and mint a session cookie.
 * Body: { email, password }. Failure always returns the same message so the
 * response does not reveal whether the address exists.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  if (!body) return badRequest("Expected a JSON body.");

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return badRequest("Enter your email and password.");

  const ip = clientIp(request);
  if (!rateLimit(`login:${ip}`) || !rateLimit(`login:${email}`)) return tooMany();

  const user = findUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) return unauthorised("Email or password is incorrect.");

  await createSession(user.id);
  // opportunistic housekeeping — one indexed DELETE each, only on real logins
  purgeExpiredSessions();
  purgeExpiredAuthTokens();
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
}
