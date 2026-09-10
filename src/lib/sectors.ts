import { Prisma } from "@prisma/client";

// Sector-allocation math. Pure & testable: given held positions (with market
// value) and a symbol→sector map, produce the breakdown by sector plus
// concentration flags. Concentration risk — too much money in one sector — is
// the quiet killer of long-term portfolios, so we surface it loudly.
//
// All money math runs in Decimal; percentages come out as plain numbers for
// the UI (a percent is already a ratio, not currency).

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export const UNKNOWN_SECTOR = "Unknown";
export const CRYPTO_SECTOR = "Crypto";

// A single holding's contribution to the allocation. marketValue is required:
// a position with no quotable value can't be weighed, so the caller filters
// those out (and we report them separately as "unpriced").
export type SectorHolding = {
  symbol: string;
  sector: string;
  marketValue: Decimal;
};

export type SectorSlice = {
  sector: string;
  marketValue: Decimal;
  pct: number; // share of total invested market value, 0–100
  symbols: string[]; // tickers in this sector, for drill-down
};

export type SectorBreakdown = {
  slices: SectorSlice[]; // sorted by marketValue desc
  total: Decimal; // total market value across all priced holdings
  topSector: SectorSlice | null; // largest slice (null if empty)
  // Concentration warnings, most severe first. Empty = well diversified.
  warnings: ConcentrationWarning[];
};

export type ConcentrationWarning = {
  level: "high" | "moderate";
  sector: string;
  pct: number;
  message: string;
};

// Thresholds for a long-term, diversified-by-default philosophy.
// >50% in one sector is a real red flag; >35% is worth a nudge.
const HIGH_PCT = 50;
const MODERATE_PCT = 35;

/**
 * Roll priced holdings up into a sector breakdown with concentration warnings.
 * Holdings with the same sector are merged; percentages are of total priced
 * market value. Single-stock concentration isn't flagged here (that's the
 * per-ticker weight already on the dashboard) — this is about *sector* risk.
 */
export function buildSectorBreakdown(
  holdings: SectorHolding[],
): SectorBreakdown {
  const total = holdings.reduce((s, h) => s.plus(h.marketValue), new Dec(0));

  if (holdings.length === 0 || total.lte(0)) {
    return { slices: [], total: new Dec(0), topSector: null, warnings: [] };
  }

  const bySector = new Map<
    string,
    { marketValue: Decimal; symbols: string[] }
  >();
  for (const h of holdings) {
    const entry = bySector.get(h.sector) ?? {
      marketValue: new Dec(0),
      symbols: [],
    };
    entry.marketValue = entry.marketValue.plus(h.marketValue);
    if (!entry.symbols.includes(h.symbol)) entry.symbols.push(h.symbol);
    bySector.set(h.sector, entry);
  }

  const slices: SectorSlice[] = [...bySector.entries()]
    .map(([sector, e]) => ({
      sector,
      marketValue: e.marketValue,
      pct: e.marketValue.div(total).mul(100).toNumber(),
      symbols: e.symbols.sort(),
    }))
    .sort((a, b) => b.marketValue.comparedTo(a.marketValue));

  const topSector = slices[0] ?? null;

  const warnings: ConcentrationWarning[] = [];
  for (const s of slices) {
    // Don't warn on a lone "Unknown" bucket — that's a data gap, not a risk.
    if (s.sector === UNKNOWN_SECTOR) continue;
    if (s.pct >= HIGH_PCT) {
      warnings.push({
        level: "high",
        sector: s.sector,
        pct: s.pct,
        message: `${s.pct.toFixed(0)}% of your portfolio is in ${s.sector}. That's heavy concentration — one bad sector year hits you hard. Consider spreading out.`,
      });
    } else if (s.pct >= MODERATE_PCT) {
      warnings.push({
        level: "moderate",
        sector: s.sector,
        pct: s.pct,
        message: `${s.pct.toFixed(0)}% of your portfolio is in ${s.sector}. Getting concentrated — worth keeping an eye on.`,
      });
    }
  }

  return { slices, total, topSector, warnings };
}
