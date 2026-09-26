import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Real email+password auth. No third-party service, no new dependencies:
 *
 *   password  -> scrypt (node:crypto) with a per-user random salt, stored as
 *                `scrypt$N$r$p$saltB64$hashB64`
 *   session   -> 256-bit random token, delivered in an HttpOnly cookie; only
 *                sha256(token) is persisted, so a database leak does not hand
 *                over live sessions
 *   lifetime  -> SESSION_TTL_MS, refreshed on every read (sliding window)
 */

export { SESSION_COOKIE };
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  calendarProvider: string | null;
  calendarConnected: boolean;
  /** true once the address has been confirmed via the emailed link */
  emailVerified: boolean;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    const salt = Buffer.from(saltB64, "base64");
    const actual = await scryptAsync(password, salt, N, r, p);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  const jar = await cookies();
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure only for requests that actually arrived over TLS: a Secure cookie
    // is silently dropped over plain http://, which would sign the user out on
    // the very next request. COOKIE_SECURE=1 forces it on regardless.
    secure: proto === "https" || process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionId = hashToken(token);
  const now = new Date();
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // sliding window — active users stay signed in
  const nextExpiry = new Date(now.getTime() + SESSION_TTL_MS);
  if (row.session.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - 60_000) {
    await db.update(sessions).set({ expiresAt: nextExpiry }).where(eq(sessions.id, sessionId));
  }

  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    calendarProvider: row.user.calendarProvider,
    calendarConnected: row.user.calendarConnected,
    emailVerified: row.user.emailVerifiedAt !== null,
  };
}

/** API routes: user or throw an AuthError (mapped to 401 by `apiGuard`). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in required");
  return user;
}

export function purgeExpiredSessions() {
  db.delete(sessions).where(lt(sessions.expiresAt, sql`CURRENT_TIMESTAMP`));
}

// ---------------------------------------------------------------------------
// Naive in-process limiter for credential endpoints (per IP + email).
// Enough to slow down scripted guessing without a redis dependency.
// ---------------------------------------------------------------------------

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5_000) attempts.clear();
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, normaliseEmail(email))).get();
}

export function countUsers() {
  const row = db.select({ n: sql<number>`count(*)` }).from(users).get();
  return row?.n ?? 0;
}

export const isAuthError = (err: unknown): err is AuthError => err instanceof AuthError;
