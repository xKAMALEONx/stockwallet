import "server-only";
import { cookies } from "next/headers";
import { signSession, verifySession, type SessionPayload } from "@/lib/jwt";

const COOKIE = "sw_session";

export async function createSession(userId: string, username: string) {
  const token = await signSession(userId, username);
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
