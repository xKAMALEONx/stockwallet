import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Shared auth gate for the scheduler-only API routes (alerts, snapshot, backfill).
 *
 * Preferred: `Authorization: Bearer <CRON_SECRET>` — same convention Vercel Cron
 * uses, and it keeps the secret out of URLs (which leak into request logs).
 *
 * Transitional: the legacy `?token=<CRON_SECRET>` query param is still accepted
 * so the existing OpenClaw cron job doesn't 401 the moment this ships. Once that
 * job is switched to the header, drop the query-param branch.
 *
 * Fails closed when CRON_SECRET is unset. Comparison is constant-time.
 */
export function requireCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const query = req.nextUrl.searchParams.get("token");
  const provided = bearer ?? query;
  if (!provided) return false;

  return safeEqual(provided, secret);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch; guard with a length check that
  // still runs a comparison to keep timing roughly uniform.
  if (ab.length !== bb.length) {
    // Compare b against itself so we still spend the work; result is false.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
