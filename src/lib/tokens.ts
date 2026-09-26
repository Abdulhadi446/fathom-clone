import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens } from "@/db/schema";

/**
 * Single-use emailed links (verify address, reset password).
 * Same rule as sessions: only sha256(token) is stored.
 */

export type TokenKind = "verify_email" | "reset_password";

const TTL_MS: Record<TokenKind, number> = {
  verify_email: 1000 * 60 * 60 * 24 * 2, // 2 days
  reset_password: 1000 * 60 * 60, // 1 hour
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Issue a token and return the raw value (give it to the user, never store it). */
export function createAuthToken(userId: string, kind: TokenKind): string {
  const token = crypto.randomBytes(32).toString("base64url");
  db.insert(authTokens).values({
    id: hashToken(token),
    userId,
    kind,
    expiresAt: new Date(Date.now() + TTL_MS[kind]),
  }).run();
  return token;
}

/** Validate + burn a token. Returns the owning user id, or null if bad/expired/used. */
export function consumeAuthToken(token: string | null | undefined, kind: TokenKind): string | null {
  if (!token) return null;
  const row = db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.id, hashToken(token)), eq(authTokens.kind, kind)))
    .get();
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id)).run();
  return row.userId;
}

/** Drop any outstanding tokens of a kind for a user (used after a successful reset). */
export function clearAuthTokens(userId: string, kind: TokenKind) {
  db.delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)))
    .run();
}
