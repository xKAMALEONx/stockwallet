import "server-only";
import { getDailyBars, historyEnabled } from "@/lib/history";
import { computeStats } from "@/lib/backtest";
import {
  getSectorMomentum,
  sectorTone as sectorToneFor,
  mapToSectorBucket,
} from "@/lib/signals-sector";
import { getSymbolNews } from "@/lib/news";
import { getConsensus, getConsensusTrend } from "@/lib/fundamentals";
import { getEarningsSurprise } from "@/lib/signals-earnings";
import { getInsiderSignal } from "@/lib/signals-insider";
import { scoreIdea } from "@/lib/idea-score";
import {
  CATALOG,
  findGapSectors,
  rankIdeas,
  type Idea,
  type IdeaSeed,
} from "@/lib/ideas";

// Assembles ranked diversification ideas for a portfolio's sector gaps — the
// "Foundation" lens. Same buddy system as the Ideas radar: each candidate pairs
// a fresh "now" read with its backtested proof, and a clash is flagged AND
// down-ranked. Server-only (needs API keys).
//
// The catalog is ETF-first. ETFs have no analyst/earnings/insider data, so those
// fresh signals stay null (the scorer treats them as neutral) — an ETF is scored
// on its SECTOR MOMENTUM + its long-term backtest proof, which is exactly the
// read that matters for a foundation holding. The example large-caps DO get the
// full fresh treatment.

export { historyEnabled };

// Map our catalog's sector label to the sector-momentum bucket. The catalog
// already uses GICS-style names, so mapToSectorBucket mostly passes them through;
// Broad Market has no single sector tone.
function sectorBucketFor(seed: IdeaSeed): string | null {
  return mapToSectorBucket(seed.sector);
}

/**
 * Given the user's current sector weights and held symbols, return ranked
 * diversification ideas (gap-fillers) with the buddy-system read attached. We
 * only do work for candidates that survive the gap filter — no wasted API calls.
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

  // Sector momentum once for the whole pass (cheap, cached).
  const sectorMomentum = historyEnabled() ? await getSectorMomentum() : [];

  const withRead: Idea[] = await Promise.all(
    candidates.map(async (seed): Promise<Idea> => {
      const bucket = sectorBucketFor(seed);
      const st = bucket ? sectorToneFor(bucket, sectorMomentum) : null;
      const sectorTone = st?.tone ?? "neutral";
      const sectorReturnPct = st?.returnPct ?? null;

      // No history source → no stats, no scoring; degrade to seed only.
      if (!historyEnabled()) {
        return {
          ...seed,
          stats: null,
          breakdown: null,
          sectorTone,
          sectorReturnPct,
        };
      }

      // Backtest proof for everything; fresh stock-only signals only for the
      // example stocks (ETFs have no analyst/earnings/insider data).
      const isStock = seed.kind === "stock";
      const [bars, news, consensus, trend, earnings, insider] =
        await Promise.all([
          getDailyBars(seed.symbol, startStr, endStr),
          getSymbolNews(seed.symbol),
          isStock ? getConsensus(seed.symbol) : Promise.resolve(null),
          isStock ? getConsensusTrend(seed.symbol) : Promise.resolve(null),
          isStock ? getEarningsSurprise(seed.symbol) : Promise.resolve(null),
          isStock ? getInsiderSignal(seed.symbol) : Promise.resolve(null),
        ]);

      const stats = bars.length >= 2 ? computeStats(bars) : null;

      const consensusNet = consensus
        ? consensus.strongBuy +
          consensus.buy -
          (consensus.sell + consensus.strongSell)
        : null;

      const breakdown = scoreIdea({
        newsSentiment: news.avgSentiment,
        mentions: news.articles.length,
        consensusNet,
        consensusDir:
          trend?.direction === "up" ? 1 : trend?.direction === "down" ? -1 : 0,
        earningsSurprisePct: earnings?.lastSurprisePct ?? null,
        insiderNetValue: insider?.netValue ?? null,
        sectorReturnPct,
        dayChangePct: null, // not fetched here — foundation is a long-term lens
        fitScore: stats?.fitScore ?? null,
      });

      return { ...seed, stats, breakdown, sectorTone, sectorReturnPct };
    }),
  );

  return rankIdeas(withRead, gaps, heldSymbols).slice(0, max);
}
