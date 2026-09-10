// Earnings-based fair-value estimate for the Bet Journal. This is the SECOND
// target lens Jaime asked for: not "where does it compound to in 5yr" (that's
// thesis-suggest.ts), but "is this stock cheap or expensive RIGHT NOW, and what
// is a defensible price?" — with every input shown, because there's no such
// thing as a perfect target price.
//
// Method (classic, transparent, no black box): fair value = normalized EPS ×
// a *justified* P/E multiple. The justified multiple is disciplined by the
// company's own growth (via a PEG anchor) and hard-capped so we never
// rubber-stamp a bubble multiple. We then compare to the live price → a
// cheap / fair / expensive verdict with the % gap.
//
// PURE: no I/O. The server wrapper feeds it Fundamentals + a live price.

export type FairValueInputs = {
  price: number | null;
  epsTTM: number | null;
  forwardPE: number | null;
  peTTM: number | null;
  epsGrowth5Y: number | null; // percent
  epsGrowth3Y: number | null; // percent
  week52High: number | null;
  week52Low: number | null;
};

export type FairValueVerdict = "UNDERVALUED" | "FAIR" | "OVERVALUED" | "UNKNOWN";

export type FairValueResult = {
  fairValue: number | null; // the earnings-based estimate
  verdict: FairValueVerdict;
  /** How far price sits above(-)/below(+) fair value, percent. +ve = cheap. */
  discountPct: number | null;
  // The inputs we actually used, surfaced so the user sees the math.
  justifiedPE: number | null;
  epsUsed: number | null;
  growthUsed: number | null; // percent growth rate anchoring the multiple
  method: "earnings" | "range" | "none";
  rationale: string;
};

// --- Discipline knobs --------------------------------------------------------
// A justified P/E shouldn't run away. PEG ~2 is a generous-but-sane anchor: a
// 20%/yr grower earns ~40× at most from growth alone. Then we hard-cap.
const PEG_ANCHOR = 2.0;
const PE_FLOOR = 8; // even slow growers trade here
const PE_CAP = 40; // refuse to bless a bubble multiple
const GROWTH_CAP = 30; // don't extrapolate >30%/yr earnings growth
// Verdict band: within ±10% of fair value is "fairly priced" — precision beyond
// that is false confidence.
const FAIR_BAND = 10;

/** Blended earnings growth estimate (percent), preferring the 5Y trend. */
function growthEstimate(g5: number | null, g3: number | null): number | null {
  const vals = [g5, g3].filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  // Weight 5Y more (durability) but let 3Y pull it if they disagree.
  if (g5 != null && g3 != null) return 0.6 * g5 + 0.4 * g3;
  return vals[0];
}

/**
 * Justified P/E: start from a growth-implied multiple (growth% × PEG anchor),
 * but never exceed the stock's *own* trailing/forward P/E when that's lower
 * (don't pay up past what the market already assigns), and clamp to [floor,cap].
 * Falls back to a blend of trailing/forward P/E when growth is unusable.
 */
export function justifiedPE(
  peTTM: number | null,
  forwardPE: number | null,
  growthPct: number | null,
): number | null {
  const marketPEs = [peTTM, forwardPE].filter(
    (v): v is number => v != null && v > 0 && Number.isFinite(v),
  );

  if (growthPct != null && growthPct > 0) {
    const g = Math.min(growthPct, GROWTH_CAP);
    const growthPE = g * PEG_ANCHOR;
    // Anchor to the lower of growth-implied and the market's own multiple, so a
    // richly-priced name isn't handed an even richer "fair" multiple.
    const anchored = marketPEs.length ? Math.min(growthPE, ...marketPEs) : growthPE;
    return Math.max(PE_FLOOR, Math.min(PE_CAP, anchored));
  }

  // No usable growth → lean on the market's multiple, clamped.
  if (marketPEs.length) {
    const avg = marketPEs.reduce((a, b) => a + b, 0) / marketPEs.length;
    return Math.max(PE_FLOOR, Math.min(PE_CAP, avg));
  }
  return null;
}

/**
 * Full fair-value read. Uses earnings when the company is profitable; otherwise
 * falls back to a 52-week-range midpoint read (clearly labeled as weaker), and
 * says so. Never throws — degrades to UNKNOWN.
 */
export function fairValue(inp: FairValueInputs): FairValueResult {
  const { price, epsTTM, peTTM, forwardPE, week52High, week52Low } = inp;
  const growthUsed = growthEstimate(inp.epsGrowth5Y, inp.epsGrowth3Y);

  // Preferred path: earnings-based, for profitable companies.
  if (epsTTM != null && epsTTM > 0) {
    const jpe = justifiedPE(peTTM, forwardPE, growthUsed);
    if (jpe != null) {
      const fv = round2(epsTTM * jpe);
      const discountPct =
        price != null && price > 0 ? round1(((fv - price) / price) * 100) : null;
      const verdict = verdictFrom(discountPct);
      return {
        fairValue: fv,
        verdict,
        discountPct,
        justifiedPE: round2(jpe),
        epsUsed: epsTTM,
        growthUsed: growthUsed != null ? round1(growthUsed) : null,
        method: "earnings",
        rationale: earningsRationale(fv, jpe, epsTTM, growthUsed, discountPct, verdict),
      };
    }
  }

  // Fallback: no positive earnings (unprofitable / early-stage). A P/E-based
  // value is meaningless, so we read the 52-week range midpoint instead and
  // label it clearly as the weaker, price-only signal.
  if (week52High != null && week52Low != null && week52High > week52Low) {
    const mid = round2((week52High + week52Low) / 2);
    const discountPct =
      price != null && price > 0 ? round1(((mid - price) / price) * 100) : null;
    return {
      fairValue: mid,
      verdict: verdictFrom(discountPct),
      discountPct,
      justifiedPE: null,
      epsUsed: epsTTM ?? null,
      growthUsed: null,
      method: "range",
      rationale:
        `No positive earnings to value on, so this is a weaker read: the midpoint of the 52-week range ($${week52Low}–$${week52High}). ` +
        `Treat as a rough anchor, not a real fair value.`,
    };
  }

  return {
    fairValue: null,
    verdict: "UNKNOWN",
    discountPct: null,
    justifiedPE: null,
    epsUsed: epsTTM ?? null,
    growthUsed: growthUsed != null ? round1(growthUsed) : null,
    method: "none",
    rationale: "Not enough fundamentals to estimate a fair value for this one.",
  };
}

function verdictFrom(discountPct: number | null): FairValueVerdict {
  if (discountPct == null) return "UNKNOWN";
  if (discountPct > FAIR_BAND) return "UNDERVALUED"; // fair value well above price
  if (discountPct < -FAIR_BAND) return "OVERVALUED";
  return "FAIR";
}

function earningsRationale(
  fv: number,
  jpe: number,
  eps: number,
  growth: number | null,
  discountPct: number | null,
  verdict: FairValueVerdict,
): string {
  const g = growth != null ? `${growth.toFixed(0)}%/yr earnings growth` : "flat earnings";
  const gap =
    discountPct == null
      ? ""
      : discountPct >= 0
        ? ` — about ${discountPct.toFixed(0)}% below fair value`
        : ` — about ${Math.abs(discountPct).toFixed(0)}% above fair value`;
  const label =
    verdict === "UNDERVALUED"
      ? "looks cheap"
      : verdict === "OVERVALUED"
        ? "looks expensive"
        : "looks fairly priced";
  return `Fair value ≈ $${fv} (EPS $${eps.toFixed(2)} × justified ${jpe.toFixed(1)}× P/E, disciplined by ${g}). It ${label}${gap}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
