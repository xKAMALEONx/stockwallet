import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQuoteData } from "@/lib/quotes";
import { captureSnapshot } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

// Called by the daily scheduler (not a browser). Auth via ?token=CRON_SECRET.
// Records one equity-curve snapshot per user (portfolio value + cost basis +
// cumulative dividends + SPY benchmark). Idempotent per calendar day.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // SPY = S&P 500 ETF, our long-term benchmark. Fetch once for all users.
  const spy = (await getQuoteData(["SPY"]))["SPY"]?.price ?? null;

  const users = await prisma.user.findMany({ select: { id: true } });
  const results = [];
  for (const u of users) {
    results.push(await captureSnapshot(u.id, spy));
  }

  const captured = results.filter((r) => r.captured).length;
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    spyPrice: spy,
    users: results.length,
    captured,
    results,
  });
}
