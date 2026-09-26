import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function unauthorised(error: string) {
  return NextResponse.json({ error }, { status: 401 });
}

export function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

export function tooMany() {
  return NextResponse.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export function readPassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) return null;
  if (value.length > 200) return null;
  return value;
}

/**
 * Resolve the signed-in user for an API handler, or return a 401 response.
 * Usage: `const user = await withUser(); if (user instanceof NextResponse) return user;`
 */
export async function withUser(): Promise<import("@/lib/auth").SessionUser | NextResponse> {
  try {
    return await requireUser();
  } catch (err) {
    if (err instanceof AuthError) return unauthorised(err.message);
    throw err;
  }
}

/** Wrap a handler so AuthError becomes a clean JSON status. */
export function withAuthErrors(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((err: unknown) => {
    if (err instanceof AuthError) return unauthorised(err.message);
    throw err;
  });
}
