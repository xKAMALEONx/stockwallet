import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computePositions, withQuotes, summarize } from "@/lib/portfolio";
import { totalIncome } from "@/lib/dividends";
import { getQuoteData } from "@/lib/quotes";

const Dec = Prisma.Decimal;

/** UTC midnight for a date — the calendar-day key for a snapshot. */
export function dayKey(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type SnapshotResult = {
  userId: string;
  date: string;
  marketValue: number | null;
  captured: boolean; // false if portfolio has no quotable market value yet
};

/**
 * Capture today's snapshot for one user: portfolio market value, cost basis,
 * cumulative dividends, and the SPY benchmark price. Idempotent — upserts on
 * (userId, date), so re-running the same day overwrites rather than duplicates.
 * Skips writing if market value is unknowable (no held quotes) so the equity
 * curve never records a phantom zero.
 */
export async function captureSnapshot(
  userId: string,
  spyPrice: number | null,
): Promise<SnapshotResult> {
  const date = dayKey();
  const dateStr = date.toISOString().slice(0, 10);

  const [txns, dividends] = await Promise.all([
    prisma.transaction.findMany({
      where: { account: { userId } },
      select: {
        symbol: true,
        side: true,
        quantity: true,
        price: true,
        fees: true,
        tradedAt: true,
      },
    }),
    prisma.dividend.findMany({
      where: { userId },
      select: { symbol: true, amount: true },
    }),
  ]);

  const positions = computePositions(txns);
  const held = positions.filter((p) => p.shares.gt(0));
  const quotes = await getQuoteData(held.map((p) => p.symbol));
  const priceMap: Record<string, number | undefined> = {};
  for (const [s, q] of Object.entries(quotes)) priceMap[s] = q?.price;

  const summary = summarize(withQuotes(positions, priceMap));
  const divTotal = totalIncome(dividends);

  // No quotable market value → don't record a misleading data point.
  if (summary.totalMarketValue === null) {
    return { userId, date: dateStr, marketValue: null, captured: false };
  }

  await prisma.portfolioSnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      marketValue: summary.totalMarketValue,
      costBasis: summary.totalCostBasis,
      dividendsTotal: divTotal,
      spyPrice: spyPrice != null ? new Dec(spyPrice) : null,
    },
    update: {
      marketValue: summary.totalMarketValue,
      costBasis: summary.totalCostBasis,
      dividendsTotal: divTotal,
      spyPrice: spyPrice != null ? new Dec(spyPrice) : null,
    },
  });

  return {
    userId,
    date: dateStr,
    marketValue: summary.totalMarketValue.toNumber(),
    captured: true,
  };
}

export function listSnapshots(userId: string) {
  return prisma.portfolioSnapshot.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });
}
