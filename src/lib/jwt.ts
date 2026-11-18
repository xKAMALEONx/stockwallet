import { SignJWT, jwtVerify } from "jose";

// Edge-safe (no next/headers, no "server-only"): usable from both server
// actions and middleware.

const ISSUER = "stockwallet";
const AUDIENCE = "stockwallet";
export const SESSION_COOKIE = "sw_session";

// A session is either mid-enrollment (password set, 2FA not yet confirmed —
// may ONLY reach /setup) or full (2FA done, or user has no 2FA requirement).
export type SessionStage = "enroll" | "full";

export type SessionPayload = {
  sub: string;
  username: string;
  stage: SessionStage;
  sv: number; // sessionVersion at sign time; must match the user's current value
};

// Resolve and validate the signing key ONCE. A short or missing AUTH_SECRET is a
// deploy-time error, not something to silently accept (prod ran an 11-char key
// once — this makes that impossible to repeat).
function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set and at least 32 characters (got " +
        (raw ? `${raw.length}` : "none") +
        ").",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(
  userId: string,
  username: string,
  opts: { stage: SessionStage; sv: number },
): Promise<string> {
  return new SignJWT({ username, stage: opts.stage, sv: opts.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || typeof payload.username !== "string") return null;
    const stage: SessionStage = payload.stage === "enroll" ? "enroll" : "full";
    const sv = typeof payload.sv === "number" ? payload.sv : 0;
    return { sub: payload.sub, username: payload.username, stage, sv };
  } catch {
    return null;
  }
}
