// apps/web/middleware.ts
//
// Edge middleware that redirects unauthenticated visitors to /welcome.
// Always enforces auth — checks for the NextAuth session cookie.
// Public paths (welcome, auth API, static assets) are exempt.

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/welcome", "/api/auth", "/favicon.ico", "/banners", "/hero", "/celebrate", "/_next", "/icon", "/manifest"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
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
    "/((?!_next/static|_next/image|favicon.ico|banners/|hero/|celebrate/|api/auth/).*)",
  ],
};
