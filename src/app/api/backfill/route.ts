import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { backfillUser } from "@/lib/backfill-source";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // reconstruction fetches multi-year history

// One-shot (re-runnable) equity-curve backfill. Reconstructs every past day
// from the first trade to today and upserts snapshots — idempotent on
// (userId, date), so it's safe to run repeatedly and safe alongside the daily
// snapshot cron. Auth via ?token=CRON_SECRET (same as /api/snapshot); not a
// public endpoint.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  const results = [];
  for (const u of users) {
    results.push(await backfillUser(u.id));
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    users: results.length,
    totalDaysWritten: results.reduce((n, r) => n + r.daysWritten, 0),
    results,
  });
}
