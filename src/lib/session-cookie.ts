/**
 * Cookie name + public path rules, in a dependency-free module so `middleware.ts`
 * (edge runtime) can import them without pulling in node:crypto / drizzle.
 */
export const SESSION_COOKIE = "fathom_session";

/** Paths that never require a session cookie (exact match). */
export const PUBLIC_EXACT = ["/login", "/signup", "/api/health"];

/** Path prefixes that never require a session cookie. */
export const PUBLIC_PREFIXES = ["/clip/", "/api/auth/", "/api/audio/", "/api/public/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
