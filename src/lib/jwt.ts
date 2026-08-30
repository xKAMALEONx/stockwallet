import { SignJWT, jwtVerify } from "jose";

// Edge-safe (no next/headers, no "server-only"): usable from both server
// actions and middleware.

export type SessionPayload = { sub: string; username: string };

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSession(
  userId: string,
  username: string,
): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.username !== "string") return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
