import { NextResponse } from "next/server";
import { rateLimit, findUserByEmail } from "@/lib/auth";
import { badRequest, clientIp, EMAIL_RE } from "@/lib/auth-http";
import { passwordResetMail } from "@/lib/mailer";
import { createAuthToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot-password — { email }
 * Always answers 200 with the same message so the response cannot be used to
 * discover which addresses have accounts.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) return badRequest("Enter a valid email address.");

  const ip = clientIp(request);
  if (!rateLimit(`forgot:${ip}`) || !rateLimit(`forgot:${email}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const user = findUserByEmail(email);
  if (user) {
    const token = createAuthToken(user.id, "reset_password");
    await passwordResetMail(user.email, token);
  }

  return NextResponse.json({
    ok: true,
    message: "If that address has a Fathom account, a reset link is on its way.",
  });
}
