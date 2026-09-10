import type { BacktestStats } from "@/lib/backtest";

// Diversification Ideas catalog + gap logic. Pure & testable. The engine looks
// at which sectors a portfolio is MISSING or thin on, then proposes evidence-
// backed ways to fill the gap — ETFs first (the long-term compounding vehicle),
// with representative large-caps as illustrations. Ranked by historical
// long-term-fit score. Never a "this will go up" prediction.

export type IdeaKind = "etf" | "stock";

// A candidate diversification idea, before we attach live backtest stats.
export type IdeaSeed = {
  symbol: string;
  name: string;
  kind: IdeaKind;
  // Sector this idea gives you exposure to. Matches Finnhub's finnhubIndustry
  // vocabulary where possible; broad-market ETFs use "Broad Market".
  sector: string;
  why: string; // plain-English reason it suits a long-term plan
};

// An idea with its historical behavior attached (from Alpaca backtest).
export type Idea = IdeaSeed & { stats: BacktestStats | null };

export const BROAD_MARKET = "Broad Market";

// Curated, deliberately small catalog. ETFs first. These are well-known, liquid,
// long-history instruments — not hot picks. Sectors chosen to cover the gaps a
// concentrated portfolio typically has.
export const CATALOG: IdeaSeed[] = [
  // Broad market — the backbone of a "compound it for decades" plan.
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    kind: "etf",
    sector: BROAD_MARKET,
    why: "Owns the 500 largest US companies at rock-bottom cost. The default core of a long-term portfolio — instant diversification in one holding.",
  },
  {
    symbol: "VTI",
    name: "Vanguard Total Stock Market ETF",
    kind: "etf",
    sector: BROAD_MARKET,
    why: "The entire US market — large, mid, and small caps. Even broader than the S&P 500, same buy-and-hold logic.",
  },
  // Sector ETFs — targeted gap-fillers.
  {
    symbol: "VHT",
    name: "Vanguard Health Care ETF",
    kind: "etf",
    sector: "Health Care",
    why: "Healthcare is defensive — people need it in any economy. A classic counterweight to tech-heavy portfolios.",
  },
  {
    symbol: "VDC",
    name: "Vanguard Consumer Staples ETF",
    kind: "etf",
    sector: "Consumer Staples",
    why: "Staples (food, household goods) hold up when the economy wobbles. Low-drama ballast for the long haul.",
  },
  {
    symbol: "VFH",
    name: "Vanguard Financials ETF",
    kind: "etf",
    sector: "Financials",
    why: "Banks and insurers — a broad, cheap way to add financial-sector exposure without betting on one company.",
  },
  {
    symbol: "VDE",
    name: "Vanguard Energy ETF",
    kind: "etf",
    sector: "Energy",
    why: "Energy often zigs when growth stocks zag, and pays healthy dividends. A real diversifier, not a core holding.",
  },
  {
    symbol: "VNQ",
    name: "Vanguard Real Estate ETF",
    kind: "etf",
    sector: "Real Estate",
    why: "REITs add real-asset exposure and income that behaves differently from stocks. A distinct sleeve for the long term.",
  },
  {
    symbol: "VPU",
    name: "Vanguard Utilities ETF",
    kind: "etf",
    sector: "Utilities",
    why: "Utilities are the definition of boring-but-steady — reliable dividends, low volatility. Portfolio shock-absorber.",
  },
  // A couple of representative large-caps, clearly flagged as examples.
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    kind: "stock",
    sector: "Health Care",
    why: "Example large-cap: a diversified healthcare giant with decades of dividend growth. Illustrates the sector — an ETF spreads the risk further.",
  },
  {
    symbol: "PG",
    name: "Procter & Gamble",
    kind: "stock",
    sector: "Consumer Staples",
    why: "Example large-cap: household brands people buy in any economy. Shows what staples look like — the ETF is the safer route.",
  },
  {
    symbol: "BRK.B",
    name: "Berkshire Hathaway (B)",
    kind: "stock",
    sector: "Financials",
    why: "Example large-cap: itself a diversified holding company. A famous long-term compounder — still one name, so size it accordingly.",
  },
];

/**
 * Which catalog sectors is the portfolio missing or thin on?
 * `heldSectors` = sectors the user already has (from allocation). `heldPct` maps
 * a sector to its current weight. A sector counts as a gap if the user has none
 * of it, OR (for non-broad sectors) has less than `thinPct`.
 * Broad Market is always eligible as a core suggestion if the user holds no
 * broad-market ETF (we can't detect that from sector alone, so we always offer
 * it unless a broad idea is already held by symbol).
 */
export function findGapSectors(
  heldSectors: Set<string>,
  heldPct: Record<string, number>,
  thinPct = 10,
): string[] {
  const catalogSectors = [...new Set(CATALOG.map((c) => c.sector))];
  const gaps: string[] = [];
  for (const sector of catalogSectors) {
    if (sector === BROAD_MARKET) {
      gaps.push(sector); // always a valid core suggestion
      continue;
    }
    const pct = heldPct[sector] ?? 0;
    if (!heldSectors.has(sector) || pct < thinPct) gaps.push(sector);
  }
  return gaps;
}

/**
 * Rank ideas for the gap sectors. ETFs sort ahead of individual stocks within
 * the same relevance; within a kind, higher fitScore first (nulls last).
 * `heldSymbols` are excluded so we never suggest something already owned.
 */
export function rankIdeas(
  ideas: Idea[],
  gapSectors: Set<string>,
  heldSymbols: Set<string>,
): Idea[] {
  return ideas
    .filter(
      (i) =>
        gapSectors.has(i.sector) &&
        !heldSymbols.has(i.symbol.toUpperCase()),
    )
    .sort((a, b) => {
      // ETFs first (the recommended vehicle).
      if (a.kind !== b.kind) return a.kind === "etf" ? -1 : 1;
      const sa = a.stats?.fitScore ?? -1;
      const sb = b.stats?.fitScore ?? -1;
      return sb - sa;
    });
}
