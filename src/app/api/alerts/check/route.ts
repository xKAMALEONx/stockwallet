import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQuoteData } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const THROTTLE = 12 * 3600 * 1000; // don't re-fire the same price alert within 12h

// Called by the scheduler (not a browser). Auth via ?token=CRON_SECRET.
// Returns human-readable notifications to relay to Jaime.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const notifications: string[] = [];

  const users = await prisma.user.findMany({ select: { id: true } });

  for (const u of users) {
    const [alerts, openTheses, recentBuys, allTheses] = await Promise.all([
      prisma.alert.findMany({ where: { userId: u.id, active: true } }),
      prisma.journalEntry.findMany({ where: { userId: u.id, status: "OPEN" } }),
      prisma.transaction.findMany({
        where: {
          account: { userId: u.id },
          side: "BUY",
          tradedAt: { gte: new Date(now - 21 * DAY) },
        },
      }),
      prisma.journalEntry.findMany({
        where: { userId: u.id },
        select: { symbol: true },
      }),
    ]);

    const symbols = [
      ...new Set([
        ...alerts.map((a) => a.symbol),
        ...openTheses.map((t) => t.symbol),
      ]),
    ];
    const quotes = await getQuoteData(symbols);

    // Price alerts
    for (const a of alerts) {
      const price = quotes[a.symbol]?.price;
      if (price == null) continue;
      const target = a.targetPrice.toNumber();
      const met = a.direction === "ABOVE" ? price >= target : price <= target;
      const recentlyFired =
        a.lastTriggeredAt &&
        now - new Date(a.lastTriggeredAt).getTime() < THROTTLE;
      if (met && !recentlyFired) {
        notifications.push(
          `🔔 ${a.symbol} ${a.direction === "ABOVE" ? "rose above" : "fell below"} $${target} — now $${price.toFixed(2)}.`,
        );
        await prisma.alert.update({
          where: { id: a.id },
          data: { lastTriggeredAt: new Date() },
        });
      }
    }

    // Theses ready to grade (target hit or timeframe expired)
    for (const t of openTheses) {
      const price = quotes[t.symbol]?.price ?? null;
      const target = t.targetPrice ? t.targetPrice.toNumber() : null;
      const targetHit =
        target != null && price != null
          ? t.direction === "BULL"
            ? price >= target
            : price <= target
          : false;
      const expired = t.timeframe ? now > new Date(t.timeframe).getTime() : false;
      if (targetHit) {
        notifications.push(
          `🎯 ${t.symbol} hit your target${target != null ? ` ($${target})` : ""} — grade your thesis in the journal.`,
        );
      } else if (expired) {
        notifications.push(
          `⏰ Your ${t.symbol} thesis passed its timeframe — time to grade it (right or wrong?).`,
        );
      }
    }

    // Recent buys with no logged thesis
    const thesisSymbols = new Set(allTheses.map((t) => t.symbol));
    for (const s of [...new Set(recentBuys.map((b) => b.symbol))]) {
      if (!thesisSymbols.has(s)) {
        notifications.push(
          `📝 You bought ${s} recently but never logged a thesis — why did you buy it?`,
        );
      }
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: notifications.length,
    notifications,
  });
}
