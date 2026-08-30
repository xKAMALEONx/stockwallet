"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";
import { createSession, destroySession, getSession } from "@/lib/session";

// Phase A of setup: create the single user (username + password). Only allowed
// when no user exists yet.
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

  await createSession(user.id, user.username);
  redirect("/setup");
}

// Phase B of setup: confirm a code from the authenticator app to turn 2FA on.
export async function enableTotp(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const user = await prisma.user.findUnique({ where: { id: session!.sub } });
  if (!user || !user.totpSecret) redirect("/setup");
  if (user.totpEnabled) redirect("/");

  if (!verifyTotp(code, user.totpSecret)) {
    redirect(
      "/setup?error=" + encodeURIComponent("That code didn't match. Try again."),
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true },
  });
  redirect("/");
}

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const fail = (): never =>
    redirect("/login?error=" + encodeURIComponent("Invalid credentials."));

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // Spend similar time as a real verify to avoid trivial user enumeration.
    await hashPassword(password || "x");
    return fail();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return fail();

  if (user.totpEnabled) {
    if (!user.totpSecret || !verifyTotp(code, user.totpSecret)) return fail();
  }

  await createSession(user.id, user.username);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
