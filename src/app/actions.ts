"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateTotpSecret, verifyTotpStep } from "@/lib/totp";
import { createSession, destroySession, getSession } from "@/lib/session";

// Brute-force backoff tuning.
const LOCK_THRESHOLD = 5; // failures before a lock kicks in
const LOCK_BASE_MS = 30_000; // 30s, doubling each failure past the threshold
const LOCK_MAX_MS = 15 * 60_000; // cap at 15 minutes

function lockDuration(failedLogins: number): number {
  const over = Math.max(0, failedLogins - LOCK_THRESHOLD);
  return Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** over);
}

// Phase A of setup: create the single user (username + password). Only allowed
// when no user exists yet. Issues an ENROLL-stage session — it can reach /setup
// to finish 2FA, but requireUser() won't treat it as fully authenticated.
export async function setupCredentials(formData: FormData) {
  if ((await prisma.user.count()) > 0) redirect("/login");

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (username.length < 3 || password.length < 8) {
    redirect(
      "/setup?error=" +
        encodeURIComponent("Username needs 3+ chars and password 8+ chars."),
    );
  }

  const passwordHash = await hashPassword(password);
  const totpSecret = generateTotpSecret();
  const user = await prisma.user.create({
    data: { username, passwordHash, totpSecret, totpEnabled: false },
  });

  await createSession(user.id, user.username, {
    stage: "enroll",
    sv: user.sessionVersion,
  });
  redirect("/setup");
}

// Phase B of setup: confirm a code from the authenticator app to turn 2FA on.
// On success, upgrade the enroll session to a FULL session.
export async function enableTotp(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.totpSecret) redirect("/setup");
  if (user.totpEnabled) redirect("/");

  const step = verifyTotpStep(code, user.totpSecret);
  if (step == null) {
    redirect(
      "/setup?error=" + encodeURIComponent("That code didn't match. Try again."),
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, lastTotpStep: BigInt(step) },
  });
  await createSession(user.id, user.username, {
    stage: "full",
    sv: user.sessionVersion,
  });
  redirect("/");
}

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const fail = (): never =>
    redirect("/login?error=" + encodeURIComponent("Invalid credentials."));
  const locked = (): never =>
    redirect(
      "/login?error=" +
        encodeURIComponent("Too many attempts — wait a bit and try again."),
    );

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // Spend similar time as a real verify to avoid trivial user enumeration.
    await hashPassword(password || "x");
    return fail();
  }

  // Brute-force lock gate.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return locked();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await registerFailure(user.id, user.failedLogins);
    return fail();
  }

  // 2FA. If enabled, require a fresh, not-yet-used code. If NOT enabled, do not
  // grant full access on password alone — route to finish enrollment.
  if (user.totpEnabled) {
    if (!user.totpSecret) {
      await registerFailure(user.id, user.failedLogins);
      return fail();
    }
    const step = verifyTotpStep(code, user.totpSecret);
    if (step == null) {
      await registerFailure(user.id, user.failedLogins);
      return fail();
    }

    // Replay guard: reject a code whose step was already consumed. Claim the
    // step atomically so two parallel logins can't both use the same code.
    const claimed = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: BigInt(step) } }],
      },
      data: { lastTotpStep: BigInt(step), failedLogins: 0, lockedUntil: null },
    });
    if (claimed.count !== 1) return fail(); // code already used (replay)

    await createSession(user.id, user.username, {
      stage: "full",
      sv: user.sessionVersion,
    });
    redirect("/");
  }

  // Password correct but 2FA never finished: reset failure counter and issue an
  // enroll-only session so the user must complete setup.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });
  await createSession(user.id, user.username, {
    stage: "enroll",
    sv: user.sessionVersion,
  });
  redirect("/setup");
}

// Record a failed attempt and lock the account once failures pass the threshold.
async function registerFailure(userId: string, current: number) {
  const next = current + 1;
  const lockMs = next >= LOCK_THRESHOLD ? lockDuration(next) : 0;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: next,
      lockedUntil: lockMs ? new Date(Date.now() + lockMs) : null,
    },
  });
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
