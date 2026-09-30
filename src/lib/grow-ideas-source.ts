import "server-only";

// The buddy-system assembly layer for the "Grow the Money" Ideas tool.
//
// It takes the FRESH news candidates and, for each, gathers every signal we can
// pull on the free tier — analyst consensus + trend, earnings beats, insider
// buying, sector momentum, today's move — AND the BACKTESTED long-term proof
// (multi-year fit score). It then runs the composite scoring engine to rank
// them for balanced long-term growth, flagging + down-ranking any idea where the
// hype and the history disagree.
//
// Read-only. Degrades gracefully: any missing signal is passed as null and the
// scorer treats it as neutral, so an idea never disappears just because one feed
// was down.

import { getNewsIdeas, newsEnabled, type Idea as NewsIdea } from "@/lib/news";
import { getQuoteData, type Quote } from "@/lib/quotes";
import {
  getConsensus,
  getConsensusTrend,
  getFundamentals,
  type Consensus,
  type Fundamentals,
} from "@/lib/fundamentals";
import {
  getEarningsSurprise,
  getUpcomingEarnings,
  type EarningsSurprise,
  type UpcomingEarnings,
} from "@/lib/signals-earnings";
import { getInsiderSignal, type InsiderSignal } from "@/lib/signals-insider";
import {
  getSectorMomentum,
  sectorTone,
  mapToSectorBucket,
  type SectorMomentum,
} from "@/lib/signals-sector";
import { getDailyBars, historyEnabled } from "@/lib/history";
import { computeStats, type BacktestStats } from "@/lib/backtest";
import { getSectors } from "@/lib/sector-source";
import { scoreIdea, type ScoreBreakdown } from "@/lib/idea-score";

export { newsEnabled };

export type GrowIdea = {
  symbol: string;
  news: NewsIdea;
  quote: Quote | undefined;
  consensus: Consensus;
  consensusDir: -1 | 0 | 1;
  fundamentals: Fundamentals;
  earnings: EarningsSurprise | null;
  upcoming: UpcomingEarnings | null;
  insider: InsiderSignal | null;
  sector: string | null;
  sectorReturnPct: number | null;
  sectorTone: "pos" | "neg" | "neutral";
  sectorLabel: string;
  stats: BacktestStats | null; // the backtested proof half
  breakdown: ScoreBreakdown;
};

const BACKTEST_YEARS = 3;

export async function getGrowIdeas(max = 8): Promise<{
  ideas: GrowIdea[];
  sectorMomentum: SectorMomentum[];
}> {
  const candidates = await getNewsIdeas();
  if (candidates.length === 0) return { ideas: [], sectorMomentum: [] };

  const symbols = candidates.map((c) => c.symbol);
  const [quoteData, sectorMomentum, sectorMap] = await Promise.all([
    getQuoteData(symbols),
    getSectorMomentum(),
    getSectors(symbols),
  ]);

  // Keep only quotable US tickers (drops OTC/foreign that slip through).
  const quotable = candidates.filter((c) => quoteData[c.symbol]);

  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - BACKTEST_YEARS);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const built = await Promise.all(
    quotable.map(async (news): Promise<GrowIdea | null> => {
      const sym = news.symbol;
      const [
        consensus,
        trend,
        fundamentals,
        earnings,
        upcoming,
        insider,
        bars,
      ] = await Promise.all([
        getConsensus(sym),
        getConsensusTrend(sym),
        getFundamentals(sym),
        getEarningsSurprise(sym),
        getUpcomingEarnings(sym),
        getInsiderSignal(sym),
        historyEnabled()
          ? getDailyBars(sym, startStr, endStr)
          : Promise.resolve([]),
      ]);

      // Require real analyst coverage — guarantees the long-term lens is
      // populated and drops PR-wire noise. (Same gate as before.)
      if (!consensus) return null;

      const stats = bars.length >= 2 ? computeStats(bars) : null;
      const sector = mapToSectorBucket(sectorMap[sym]);
      const st = sector ? sectorTone(sector, sectorMomentum) : null;
      const quote = quoteData[sym];

      const consensusNet = consensus
        ? consensus.strongBuy + consensus.buy - (consensus.sell + consensus.strongSell)
        : null;

      const breakdown = scoreIdea({
        newsSentiment: news.avgSentiment,
        mentions: news.mentions,
        consensusNet,
        consensusDir: trend?.direction === "up" ? 1 : trend?.direction === "down" ? -1 : 0,
        earningsSurprisePct: earnings?.lastSurprisePct ?? null,
        insiderNetValue: insider?.netValue ?? null,
        sectorReturnPct: st?.returnPct ?? null,
        dayChangePct: quote?.changePct ?? null,
        fitScore: stats?.fitScore ?? null,
      });

      return {
        symbol: sym,
        news,
        quote,
        consensus,
        consensusDir:
          trend?.direction === "up" ? 1 : trend?.direction === "down" ? -1 : 0,
        fundamentals,
        earnings,
        upcoming,
        insider,
        sector,
        sectorReturnPct: st?.returnPct ?? null,
        sectorTone: st?.tone ?? "neutral",
        sectorLabel: st?.label ?? "Sector n/a",
        stats,
        breakdown,
      };
    }),
  );

  const ideas = built
    .filter((x): x is GrowIdea => x !== null)
    // Composite score desc; the scorer has already down-ranked conflicts.
    .sort((a, b) => b.breakdown.score - a.breakdown.score)
    .slice(0, max);

  return { ideas, sectorMomentum };
}
