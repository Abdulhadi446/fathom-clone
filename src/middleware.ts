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
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // everything except next internals and files with an extension
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
