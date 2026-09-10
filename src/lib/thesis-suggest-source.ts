import "server-only";

// Server wrapper for the Bet Journal auto-suggestion. Pulls the real inputs —
// multi-year price history (Alpaca for stocks, CoinGecko for crypto), a live
// quote, and analyst consensus — then hands them to the pure suggestThesis()
// engine. Read-only; degrades gracefully to a neutral default if data is thin.

import { getDailyBars, historyEnabled } from "@/lib/history";
import { getCryptoDailyCloses, isCryptoSymbol } from "@/lib/crypto-history";
import { computeStats, type BarClose } from "@/lib/backtest";
import { getConsensus } from "@/lib/fundamentals";
import { getQuoteData } from "@/lib/quotes";
import { suggestThesis, type ThesisSuggestion } from "@/lib/thesis-suggest";

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
export async function suggestForSymbol(symbol: string): Promise<ThesisSuggestion> {
  const sym = symbol.trim().toUpperCase();

  const [bars, quote, consensus] = await Promise.all([
    loadHistory(sym),
    getQuoteData([sym]).catch(() => ({}) as Record<string, { price: number }>),
    isCryptoSymbol(sym) ? Promise.resolve(null) : getConsensus(sym).catch(() => null),
  ]);

  const stats = computeStats(bars);
  const price = quote[sym]?.price ?? null;

  return suggestThesis(price, stats, consensus);
}
