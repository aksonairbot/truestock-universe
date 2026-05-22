// apps/web/middleware.ts
//
// Edge middleware that redirects unauthenticated visitors to /welcome.
// Validates the NextAuth JWT — does NOT trust mere cookie presence, because
// any client can set an arbitrary cookie value. Public paths (welcome, auth
// API, static assets) are exempt.
//
// Importing the full `auth` wrapper from ../auth.ts would drag @tu/db (and
// `postgres`, which uses Node's `stream`) into the Edge Runtime and break
// the build. Instead we call getToken() directly — it parses + verifies the
// JWT signature against AUTH_SECRET without touching the DB layer.

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/welcome", "/api/auth", "/favicon.ico", "/banners", "/hero", "/celebrate", "/_next", "/icon", "/manifest"];

// Edge runtime — `process.env.AUTH_SECRET` is inlined at build time. If
// it wasn't set when the build ran, the middleware will throw on first
// request (which fails closed to a 500). That's what we want — there's
// no scenario where defaulting to a publicly-known secret here is OK.
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET is required for the middleware. Set it in .env (or /etc/truestock/env on the server) before building.",
  );
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // NextAuth v5 cookie names: prefixed with __Secure- when HTTPS.
  const token = await getToken({
    req,
    secret: AUTH_SECRET,
    cookieName: req.nextUrl.protocol === "https:"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
    // Without this, getToken hardcodes the legacy cookie name and won't
    // recognise the v5 `authjs.*` cookie that our auth.ts sets.
    salt: req.nextUrl.protocol === "https:"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });

  if (!token) {
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
