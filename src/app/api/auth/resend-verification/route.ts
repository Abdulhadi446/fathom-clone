import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/auth";
import { withUser } from "@/lib/auth-http";
import { verifyEmailMail } from "@/lib/mailer";
import { createAuthToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/resend-verification — send a fresh confirmation link.
 * Requires a session (you can only confirm the address you are signed in as).
 */
export async function POST() {
  const user = await withUser();
  if (user instanceof NextResponse) return user;
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });
  if (!rateLimit(`resend:${user.id}`)) {
    return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  const token = createAuthToken(user.id, "verify_email");
  const mail = await verifyEmailMail(user.email, token);
  // Surface the delivery problem instead of pretending it worked — with the
  // default Resend sender only Resend's own address receives mail.
  return NextResponse.json({ ok: mail.ok, sent: mail.ok, error: mail.error ?? null });
}
