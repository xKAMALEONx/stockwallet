import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export type AuthedUser = {
  id: string;
  username: string;
  totpEnabled: boolean;
  sessionVersion: number;
};

/**
 * The single data-access gate for every server action / server component that
 * needs the logged-in user. Replaces the copy-pasted
 * `getSession(); if (!session) redirect("/login"); … session!.sub` pattern.
 *
 * Beyond "is the JWT valid", it confirms:
 *   - the user still exists (a deleted user's token stops working), and
 *   - the token's sessionVersion matches the user's current one (so a
 *     logout-everywhere / password change can invalidate outstanding sessions).
 *
 * An "enroll"-stage session (mid-2FA-setup) is NOT a full user here — callers
 * that need a fully-authenticated user get redirected to finish setup.
 */
export async function requireUser(): Promise<AuthedUser> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      username: true,
      totpEnabled: true,
      sessionVersion: true,
    },
  });

  // User gone, or this token was invalidated by a sessionVersion bump.
  if (!user || user.sessionVersion !== session.sv) redirect("/login");

  // A half-finished 2FA setup may not act as a full user.
  if (session.stage === "enroll") redirect("/setup");

  return user;
}
