// apps/web/middleware.ts
//
// Edge middleware that redirects unauthenticated visitors to /welcome.
// When AUTH_SECRET is unset (stub mode) we let everything through — the
// legacy stub auth in lib/auth.ts handles per-request user lookup.

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/welcome", "/api/auth", "/favicon.ico", "/banners", "/hero", "/celebrate", "/_next", "/icon", "/manifest"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const enabled = !!process.env.AUTH_SECRET;
  if (!enabled) return NextResponse.next(); // stub mode

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // The session cookie name in v5 is `authjs.session-token` on http,
  // `__Secure-authjs.session-token` on https. Check both.
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/welcome";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except internal assets — explicit list keeps middleware fast.
    "/((?!_next/static|_next/image|favicon.ico|banners/|hero/|celebrate/|api/auth/).*)",
  ],
};
