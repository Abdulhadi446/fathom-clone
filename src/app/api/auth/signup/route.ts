import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword, normaliseEmail, rateLimit } from "@/lib/auth";
import { EMAIL_RE, badRequest, clientIp, conflict, readPassword, tooMany } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup — create a real account and sign in.
 * Body: { name, email, password }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
  } | null;
  if (!body) return badRequest("Expected a JSON body.");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  const password = readPassword(body.password);

  if (!name || name.length > 80) return badRequest("Enter your name.");
  if (!EMAIL_RE.test(email) || email.length > 254) return badRequest("Enter a valid email address.");
  if (!password) return badRequest("Password must be at least 8 characters.");

  if (!rateLimit(`signup:${clientIp(request)}`)) return tooMany();

  const taken = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (taken) return conflict("That email is already registered.");

  const id = `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ id, name, email, passwordHash });
  await createSession(id);

  return NextResponse.json({ user: { id, name, email } }, { status: 201 });
}
