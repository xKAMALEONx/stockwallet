import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQuoteData } from "@/lib/quotes";
import { requireCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const THROTTLE = 12 * 3600 * 1000; // don't re-fire the same price alert within 12h

// Called by the scheduler (not a browser). Auth via Authorization: Bearer <CRON_SECRET>.
// Returns human-readable notifications to relay to Jaime.
export async function GET(req: NextRequest) {
  if (!requireCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const notifications: string[] = [];
  const errors: string[] = [];

  const users = await prisma.user.findMany({ select: { id: true } });

  for (const u of users) {
    try {
      const [alerts, openProjections, recentBuys, allTheses] = await Promise.all([
        prisma.alert.findMany({ where: { userId: u.id, active: true } }),
        // Only PROJECTION entries have targets to grade. WATCH entries are notes.
        // targetHitNotifiedAt == null means we haven't nudged about this one yet.
        prisma.journalEntry.findMany({
          where: {
            userId: u.id,
            kind: "PROJECTION",
            targetPrice: { not: null },
            targetHitNotifiedAt: null,
          },
        }),
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
          ...openProjections.map((t) => t.symbol),
        ]),
      ];
      const quotes = await getQuoteData(symbols);

      // Price alerts — claim each fire atomically so overlapping runs can't
      // double-notify, and only push the message once the claim succeeds.
      for (const a of alerts) {
        const price = quotes[a.symbol]?.price;
        if (price == null) continue;
        const target = a.targetPrice.toNumber();
        const met = a.direction === "ABOVE" ? price >= target : price <= target;
        if (!met) continue;

        const cutoff = new Date(now - THROTTLE);
        const claimed = await prisma.alert.updateMany({
          where: {
            id: a.id,
            active: true,
            OR: [{ lastTriggeredAt: null }, { lastTriggeredAt: { lt: cutoff } }],
          },
          data: { lastTriggeredAt: new Date() },
        });
        if (claimed.count === 1) {
          notifications.push(
            `🔔 ${a.symbol} ${a.direction === "ABOVE" ? "rose above" : "fell below"} $${target} — now $${price.toFixed(2)}.`,
          );
        }
      }

      // Projections whose target has been reached — nudge once, ever, per entry.
      for (const t of openProjections) {
        const price = quotes[t.symbol]?.price ?? null;
        const target = t.targetPrice ? t.targetPrice.toNumber() : null;
        if (target == null || price == null) continue;
        const targetHit = t.direction === "BULL" ? price >= target : price <= target;
        if (!targetHit) continue;

        const claimed = await prisma.journalEntry.updateMany({
          where: { id: t.id, targetHitNotifiedAt: null },
          data: { targetHitNotifiedAt: new Date() },
        });
        if (claimed.count === 1) {
          notifications.push(
            `🎯 ${t.symbol} reached your $${target} target (now $${price.toFixed(2)}) — revisit your projection in the journal.`,
          );
        }
      }

      // Recent buys with no logged thesis — once per cron window is fine here
      // (these are nudges, not alerts), but only for symbols still un-journaled.
      const thesisSymbols = new Set(allTheses.map((t) => t.symbol));
      for (const s of [...new Set(recentBuys.map((b) => b.symbol))]) {
        if (!thesisSymbols.has(s)) {
          notifications.push(
            `📝 You bought ${s} recently but never logged a thesis — why did you buy it?`,
          );
        }
      }
    } catch (e) {
      // One user's failure shouldn't drop everyone else's notifications.
      errors.push(`user ${u.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: notifications.length,
    notifications,
    ...(errors.length ? { errors } : {}),
  });
}
