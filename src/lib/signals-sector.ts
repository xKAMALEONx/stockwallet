import "server-only";

// Sector-momentum signal. Ranks the 11 GICS sectors by recent (default 3-month)
// price momentum using their bellwether Vanguard ETFs, so an idea can be framed
// against where money is actually flowing right now — a tailwind or a headwind.
//
// This is the "where's the money going" half of the grow-the-money tool. It's
// descriptive (recent relative strength), never a prediction. Uses the same
// Alpaca history the backtest engine uses.

import { getDailyBars, historyEnabled } from "@/lib/history";

// Sector → representative Vanguard ETF. Matches the sector vocabulary used by
// the diversification catalog and Finnhub's finnhubIndustry where practical.
export const SECTOR_ETFS: Record<string, string> = {
  "Information Technology": "VGT",
  "Health Care": "VHT",
  Financials: "VFH",
  "Consumer Discretionary": "VCR",
  "Consumer Staples": "VDC",
  Energy: "VDE",
  Industrials: "VIS",
  Materials: "VAW",
  Utilities: "VPU",
  "Real Estate": "VNQ",
  "Communication Services": "VOX",
};

// Finnhub's `finnhubIndustry` vocabulary → our GICS-style ETF buckets. Finnhub
// is granular ("Semiconductors", "Banking"), so we fold those into the broad
// sector whose ETF represents them. Anything unmapped returns null (no tone).
const INDUSTRY_TO_BUCKET: Record<string, string> = {
  Semiconductors: "Information Technology",
  Technology: "Information Technology",
  "Electronic Equipment": "Information Technology",
  Software: "Information Technology",
  "Communications": "Communication Services",
  Media: "Communication Services",
  Telecommunication: "Communication Services",
  "Health Care": "Health Care",
  Pharmaceuticals: "Health Care",
  Biotechnology: "Health Care",
  "Life Sciences Tools & Services": "Health Care",
  "Medical Devices": "Health Care",
  "Financial Services": "Financials",
  Banking: "Financials",
  Insurance: "Financials",
  "Retail": "Consumer Discretionary",
  "Automobiles": "Consumer Discretionary",
  "Hotels, Restaurants & Leisure": "Consumer Discretionary",
  "Textiles, Apparel & Luxury Goods": "Consumer Discretionary",
  "Consumer products": "Consumer Staples",
  "Food Products": "Consumer Staples",
  "Beverages": "Consumer Staples",
  "Energy": "Energy",
  "Oil & Gas": "Energy",
  Industrials: "Industrials",
  "Machinery": "Industrials",
  Aerospace: "Industrials",
  "Logistics & Transportation": "Industrials",
  "Basic Materials": "Materials",
  Chemicals: "Materials",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",
};

/**
 * Fold a Finnhub industry string into one of our sector-ETF buckets. Tries an
 * exact match, then a case-insensitive contains-scan so minor label drift
 * ("Retailing" vs "Retail") still lands. Returns null when nothing fits.
 */
export function mapToSectorBucket(industry: string | null | undefined): string | null {
  if (!industry) return null;
  if (INDUSTRY_TO_BUCKET[industry]) return INDUSTRY_TO_BUCKET[industry];
  const low = industry.toLowerCase();
  for (const [key, bucket] of Object.entries(INDUSTRY_TO_BUCKET)) {
    if (low.includes(key.toLowerCase())) return bucket;
  }
  // Last resort: if the industry name IS already a bucket key, use it.
  if (SECTOR_ETFS[industry]) return industry;
  return null;
}

export type SectorMomentum = {
  sector: string;
  etf: string;
  returnPct: number | null; // trailing-window price return
  rank: number; // 1 = strongest of the sectors we could price
};

/**
 * Trailing-window return for every sector ETF, ranked strongest → weakest.
 * Sectors we can't price (history off / no data) are dropped, not guessed.
 */
export async function getSectorMomentum(
  windowDays = 90,
): Promise<SectorMomentum[]> {
  if (!historyEnabled()) return [];

  const end = new Date();
  const start = new Date(end.getTime() - windowDays * 86400000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const startStr = ymd(start);
  const endStr = ymd(end);

  const rows = await Promise.all(
    Object.entries(SECTOR_ETFS).map(async ([sector, etf]) => {
      const bars = await getDailyBars(etf, startStr, endStr);
      const closes = bars.map((b) => b.close).filter((c) => c > 0);
      const returnPct =
        closes.length >= 2 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null;
      return { sector, etf, returnPct, rank: 0 };
    }),
  );

  const priced = rows.filter((r) => r.returnPct !== null);
  priced.sort((a, b) => (b.returnPct as number) - (a.returnPct as number));
  priced.forEach((r, i) => (r.rank = i + 1));
  return priced;
}

/**
 * A hot/cold read for one sector relative to the pack. "hot" = top third,
 * "cold" = bottom third, else "mid". Neutral when we can't rank it.
 */
export function sectorTone(
  sector: string,
  ranked: SectorMomentum[],
): { tone: "pos" | "neg" | "neutral"; label: string; returnPct: number | null } {
  const row = ranked.find((r) => r.sector === sector);
  if (!row || row.returnPct === null || ranked.length === 0) {
    return { tone: "neutral", label: "Sector flat", returnPct: null };
  }
  const third = Math.max(1, Math.ceil(ranked.length / 3));
  const pct = Math.round(row.returnPct * 10) / 10;
  const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
  if (row.rank <= third) return { tone: "pos", label: `Hot sector (${sign})`, returnPct: pct };
  if (row.rank > ranked.length - third)
    return { tone: "neg", label: `Cold sector (${sign})`, returnPct: pct };
  return { tone: "neutral", label: `Sector ${sign}`, returnPct: pct };
}
