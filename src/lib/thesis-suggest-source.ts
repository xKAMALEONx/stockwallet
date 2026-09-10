import "server-only";

// Server wrapper for the Bet Journal auto-suggestion. Pulls the real inputs —
// multi-year price history (Alpaca for stocks, CoinGecko for crypto), a live
// quote, and analyst consensus — then hands them to the pure suggestThesis()
// engine. Read-only; degrades gracefully to a neutral default if data is thin.

import { getDailyBars, historyEnabled } from "@/lib/history";
import { getCryptoDailyCloses, isCryptoSymbol } from "@/lib/crypto-history";
import { computeStats, type BarClose } from "@/lib/backtest";
import { getConsensus, getFundamentals } from "@/lib/fundamentals";
import { getQuoteData } from "@/lib/quotes";
import { suggestThesis, type ThesisSuggestion } from "@/lib/thesis-suggest";
import { fairValue, type FairValueResult } from "@/lib/fair-value";

export type FullSuggestion = ThesisSuggestion & {
  /** Earnings-based "is it cheap/expensive now" read. Null for crypto. */
  fair: FairValueResult | null;
};

const YMD = (d: Date) => d.toISOString().slice(0, 10);

/** Daily closes as BarClose[] for either a stock or a crypto ticker. */
async function loadHistory(symbol: string): Promise<BarClose[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 5 * 365.25 * 86400000); // ~5yr window

  if (isCryptoSymbol(symbol)) {
    const closes = await getCryptoDailyCloses(symbol, YMD(start));
    return Object.entries(closes)
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  if (!historyEnabled()) return [];
  const bars = await getDailyBars(symbol, YMD(start), YMD(end));
  return bars.map((b) => ({ date: b.date, close: b.close }));
}

/**
 * Build the auto-fill suggestion for one ticker. Never throws — on any missing
 * piece it returns a sane neutral suggestion (MEDIUM, no target) so the form
 * still fills something the user can edit.
 */
export async function suggestForSymbol(symbol: string): Promise<FullSuggestion> {
  const sym = symbol.trim().toUpperCase();
  const isCrypto = isCryptoSymbol(sym);

  const [bars, quote, consensus, fundamentals] = await Promise.all([
    loadHistory(sym),
    getQuoteData([sym]).catch(() => ({}) as Record<string, { price: number }>),
    isCrypto ? Promise.resolve(null) : getConsensus(sym).catch(() => null),
    isCrypto ? Promise.resolve(null) : getFundamentals(sym).catch(() => null),
  ]);

  const stats = computeStats(bars);
  const price = quote[sym]?.price ?? null;

  const base = suggestThesis(price, stats, consensus);

  // Earnings-based fair value only makes sense for stocks with fundamentals.
  const fair =
    !isCrypto && fundamentals
      ? fairValue({
          price,
          epsTTM: fundamentals.epsTTM,
          forwardPE: fundamentals.forwardPE,
          peTTM: fundamentals.peTTM,
          epsGrowth5Y: fundamentals.epsGrowth5Y,
          epsGrowth3Y: fundamentals.epsGrowth3Y,
          week52High: fundamentals.week52High,
          week52Low: fundamentals.week52Low,
        })
      : null;

  return { ...base, fair };
}
