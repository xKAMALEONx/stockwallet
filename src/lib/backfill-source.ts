import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDailyBars, historyEnabled } from "@/lib/history";
import { getCryptoDailyCloses, isCryptoSymbol } from "@/lib/crypto-history";
import {
  reconstructCurveDetailed,
  fillForward,
  ymd,
  type CloseTable,
  type DatedDividend,
} from "@/lib/backfill";
import type { EngineTxn } from "@/lib/portfolio";

const Dec = Prisma.Decimal;

export type BackfillResult = {
  userId: string;
  from: string;
  to: string;
  daysWritten: number;
  symbols: string[];
  cryptoSymbols: string[];
  droppedForMissing: number; // calendar days skipped for lacking a close
  partialCryptoRange: boolean; // true if crypto history couldn't reach `from`
};

/**
 * Rebuild the full equity curve for one user from their first trade to today
 * and upsert every reconstructable day. Idempotent on (userId, date) — safe to
 * re-run and safe alongside the daily cron. Requires Alpaca history; crypto
 * days need CoinGecko (deeper than ~365d needs COINGECKO_API_KEY).
 */
export async function backfillUser(userId: string): Promise<BackfillResult> {
  const [txnRows, divRows] = await Promise.all([
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
      select: { symbol: true, amount: true, paidAt: true },
    }),
  ]);

  const txns: EngineTxn[] = txnRows.map((t) => ({
    symbol: t.symbol,
    side: t.side as "BUY" | "SELL",
    quantity: t.quantity,
    price: t.price,
    fees: t.fees,
    tradedAt: t.tradedAt,
  }));
  const divs: DatedDividend[] = divRows.map((d) => ({
    symbol: d.symbol,
    amount: d.amount,
    paidAt: d.paidAt,
  }));

  const emptyResult = (): BackfillResult => ({
    userId,
    from: "",
    to: "",
    daysWritten: 0,
    symbols: [],
    cryptoSymbols: [],
    droppedForMissing: 0,
    partialCryptoRange: false,
  });

  if (txns.length === 0) return emptyResult();

  // Range: first trade → today (UTC).
  const firstMs = Math.min(...txns.map((t) => t.tradedAt.getTime()));
  const start = new Date(firstMs);
  const end = new Date();
  const startStr = ymd(start);
  const endStr = ymd(end);

  // Every symbol ever traded (SELLs can zero a position, but we still need its
  // closes for the days it was held).
  const allSymbols = Array.from(new Set(txns.map((t) => t.symbol.toUpperCase())));
  const cryptoSymbols = allSymbols.filter(isCryptoSymbol);
  const stockSymbols = allSymbols.filter((s) => !isCryptoSymbol(s));

  const closes: CloseTable = {};
  let partialCryptoRange = false;

  // Stocks + SPY benchmark via Alpaca.
  if (historyEnabled()) {
    const stockFetch = [...stockSymbols, "SPY"].map(async (sym) => {
      const bars = await getDailyBars(sym, startStr, endStr);
      const series: Record<string, number> = {};
      for (const b of bars) series[b.date] = b.close;
      closes[sym] = series;
    });
    await Promise.all(stockFetch);
  }

  // Crypto via CoinGecko. Detect whether we actually reached `start`.
  for (const sym of cryptoSymbols) {
    const series = await getCryptoDailyCloses(sym, startStr);
    closes[sym] = series;
    const earliest = Object.keys(series).sort()[0];
    if (!earliest || earliest > startStr) partialCryptoRange = true;
  }

  // Carry closes across weekends/holidays so held value doesn't gap.
  const filled = fillForward(closes, start, end);
  const { rows, dropped } = reconstructCurveDetailed(
    start,
    end,
    txns,
    divs,
    filled,
  );

  // Upsert each reconstructable row.
  let written = 0;
  for (const r of rows) {
    const date = new Date(`${r.date}T00:00:00.000Z`);
    await prisma.portfolioSnapshot.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        marketValue: r.marketValue,
        costBasis: r.costBasis,
        dividendsTotal: r.dividendsTotal,
        spyPrice: r.spyPrice != null ? new Dec(r.spyPrice) : null,
      },
      update: {
        marketValue: r.marketValue,
        costBasis: r.costBasis,
        dividendsTotal: r.dividendsTotal,
        spyPrice: r.spyPrice != null ? new Dec(r.spyPrice) : null,
      },
    });
    written++;
  }

  return {
    userId,
    from: rows[0]?.date ?? startStr,
    to: rows[rows.length - 1]?.date ?? endStr,
    daysWritten: written,
    symbols: stockSymbols,
    cryptoSymbols,
    droppedForMissing: dropped,
    partialCryptoRange,
  };
}
