import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/jwt";

// Public routes that don't require a session.
// These API routes guard themselves with ?token=CRON_SECRET, so they bypass
// the session gate (they're called by schedulers/one-shots, not browsers).
const PUBLIC = [
  "/login",
  "/setup",
  "/api/alerts",
  "/api/snapshot",
  "/api/backfill",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Enroll-stage sessions (password set, 2FA not finished) may only reach
  // /setup. Anything else bounces back there so 2FA can't be skipped. (/setup
  // itself is in PUBLIC above, so it's already allowed.)
  if (session.stage === "enroll") {
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
