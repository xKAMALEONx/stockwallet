import "server-only";
import { cookies } from "next/headers";
import {
  signSession,
  verifySession,
  SESSION_COOKIE,
  type SessionPayload,
  type SessionStage,
} from "@/lib/jwt";

const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Issue a session cookie. `stage` defaults to "full"; pass "enroll" for the
 * mid-2FA-setup session that may only reach /setup. `sv` must be the user's
 * current sessionVersion so a later bump invalidates this token.
 */
export async function createSession(
  userId: string,
  username: string,
  opts: { stage?: SessionStage; sv: number },
) {
  const token = await signSession(userId, username, {
    stage: opts.stage ?? "full",
    sv: opts.sv,
  });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

/**
 * Low-level: decode the cookie's JWT. Does NOT verify the user still exists or
 * that sessionVersion matches — for that, use `requireUser()` from the DAL.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
