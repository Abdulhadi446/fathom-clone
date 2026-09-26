/**
 * Transactional email via the Resend HTTP API — no SDK, just fetch.
 *
 * Key: RESEND_API_KEY (see .env.example). Sender defaults to Resend's own
 * onboarding address, which only delivers to the address of the Resend account
 * itself; set EMAIL_FROM to a domain you have verified with Resend to reach
 * anyone else.
 */

const RESEND_KEY = process.env.RESEND_API_KEY ?? process.env.RESENND_API_KEY ?? "";

export const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

/** Canonical origin for links inside emails (must be the public HTTPS URL). */
export function appUrl(path = "/"): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface MailResult {
  ok: boolean;
  error?: string;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

const shell = (title: string, body: string, actionLabel?: string, actionUrl?: string) => `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:32px 16px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
    <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px">Fathom</div>
    <h1 style="font-size:20px;margin:16px 0 8px;color:#111827">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px">${body}</p>
    ${
      actionLabel && actionUrl
        ? `<p style="margin:24px 0"><a href="${actionUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${actionLabel}</a></p>
           <p style="font-size:13px;color:#6b7280;margin:0">If the button doesn't work, paste this link into your browser:<br><a href="${actionUrl}" style="color:#2563eb;word-break:break-all">${actionUrl}</a></p>`
        : ""
    }
    <p style="font-size:13px;color:#9ca3af;margin:28px 0 0">This link expires — if you didn't request it, you can ignore this email.</p>
  </div>
</div>`;

export function verifyEmailMail(to: string, token: string) {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return sendMail({
    to,
    subject: "Confirm your email for Fathom",
    html: shell(
      "Confirm your email address",
      "One last step — confirm this address so we know we can reach you about your meetings and sign-in links.",
      "Confirm email",
      url,
    ),
    text: `Confirm your email address for Fathom:\n\n${url}\n\nIf you didn't create this account you can ignore this email.`,
  });
}

export function passwordResetMail(to: string, token: string) {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return sendMail({
    to,
    subject: "Reset your Fathom password",
    html: shell(
      "Reset your password",
      "We received a request to reset the password for this Fathom account. Choose a new password with the link below.",
      "Choose a new password",
      url,
    ),
    text: `Reset your Fathom password:\n\n${url}\n\nIf you didn't request this, ignore this email — your password has not changed.`,
  });
}
