import "server-only";
import { getDailyBars, historyEnabled } from "@/lib/history";
import { computeStats } from "@/lib/backtest";
import {
  CATALOG,
  findGapSectors,
  rankIdeas,
  type Idea,
} from "@/lib/ideas";

// Assembles ranked diversification ideas for a portfolio's sector gaps, with
// live backtest stats from Alpaca attached. Server-only (needs API keys).

export { historyEnabled };

/**
 * Given the user's current sector weights and held symbols, return ranked
 * diversification ideas (gap-fillers) with historical stats. We only fetch
 * bars for candidates that survive the gap filter — no wasted API calls.
 */
export async function getDiversificationIdeas(input: {
  heldSectors: Set<string>;
  heldPct: Record<string, number>;
  heldSymbols: Set<string>;
  lookbackYears?: number;
  max?: number;
}): Promise<Idea[]> {
  const {
    heldSectors,
    heldPct,
    heldSymbols,
    lookbackYears = 3,
    max = 6,
  } = input;

  const gaps = new Set(findGapSectors(heldSectors, heldPct));

  // Candidate seeds = catalog entries in gap sectors not already held.
  const candidates = CATALOG.filter(
    (c) => gaps.has(c.sector) && !heldSymbols.has(c.symbol.toUpperCase()),
  );

  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - lookbackYears);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // Attach stats. If history is off, stats stay null and ETFs still rank by
  // vehicle (kind) so the feature degrades gracefully.
  const withStats: Idea[] = await Promise.all(
    candidates.map(async (seed): Promise<Idea> => {
      if (!historyEnabled()) return { ...seed, stats: null };
      const bars = await getDailyBars(seed.symbol, startStr, endStr);
      const stats = bars.length >= 2 ? computeStats(bars) : null;
      return { ...seed, stats };
    }),
  );

  return rankIdeas(withStats, gaps, heldSymbols).slice(0, max);
}
