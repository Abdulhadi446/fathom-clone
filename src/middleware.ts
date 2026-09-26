import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isPublicPath } from "@/lib/session-cookie";

/**
 * Gatekeeper.
 *
 * This runs in the edge runtime, so it only checks that the session cookie is
 * *present* — the real, cryptographic validation of the token happens in
 * `src/lib/auth.ts` inside every server page and API handler (`requireUser`).
 * A forged or stale cookie therefore gets past the redirect and is rejected
 * with a 401/404 deeper in the stack.
 */
/**
 * The origin the *browser* should be pointed at. `request.url` reports the
 * upstream address (127.0.0.1:3100 behind nginx), so prefer the headers the
 * reverse proxy sets, then the raw Host header.
 */
function publicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    // Next validates Location with `new URL()`, so it must be absolute — but
    // behind nginx `request.url` points at 127.0.0.1:3100. Rebuild the origin
    // from the forwarded headers instead so the browser lands on the public host.
    const location = `${publicOrigin(request)}/login?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(location, 307);
  }

  return NextResponse.next();
}

export const config = {
  // everything except next internals and files with an extension
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
