// Auto-suggestion engine for the Bet Journal. Jaime didn't want to *guess* a
// conviction level or a target price — he wanted the system to decide, using the
// same backtested numbers the Ideas engine already trusts, with the long-term
// "compound toward big multiples" mindset baked in.
//
// This module is PURE (no I/O, no Prisma, no fetch) so it's fully unit-testable.
// The server wrapper (thesis-suggest-source.ts) feeds it real backtest stats +
// analyst consensus + a live price; this file turns those into:
//   - a conviction level  (LOW | MEDIUM | HIGH)  — how much to trust the play
//   - a long-term target price + horizon         — where a steady compounder
//                                                   could reach, not a 12-mo call
//
// Everything here is DESCRIPTIVE reasoning over history, never a prediction. The
// target is explicitly framed as "if it keeps compounding like it has, tempered."

import type { BacktestStats } from "@/lib/backtest";
import type { Consensus } from "@/lib/fundamentals";

export type Conviction = "LOW" | "MEDIUM" | "HIGH";

export type ThesisSuggestion = {
  conviction: Conviction;
  /** Suggested target price (long-term compounding), or null if we can't. */
  targetPrice: number | null;
  /** Years the target projects over. */
  horizonYears: number;
  /** Multiple of the current price the target represents (targetPrice/price). */
  targetMultiple: number | null;
  /** The tempered annual growth rate we projected forward (percent). */
  projectedCagrPct: number | null;
  /** Plain-language why, for the UI tooltip / thesis seed. */
  rationale: string;
  /** True when we had enough history to reason; false → soft defaults. */
  confident: boolean;
};

// --- Long-term horizon -------------------------------------------------------
// Jaime's mindset is "quadruple the money" — a multi-year compounding goal, not
// a next-quarter fair value. Five years is the sweet spot: long enough for
// compounding to show real multiples, short enough to stay a plannable target.
export const HORIZON_YEARS = 5;

// A hot stock's trailing CAGR is not a promise. We temper it hard so the target
// is aspirational-but-grounded rather than a fantasy extrapolation:
//   1. Cap the annual rate we're willing to project forward.
//   2. Haircut it (assume the pace cools as the company matures / mean-reverts).
const MAX_PROJECTED_CAGR = 25; // never project more than 25%/yr forward
const CAGR_HAIRCUT = 0.7; // keep 70% of the (capped) historical pace
const MIN_PROJECTED_CAGR = 4; // floor: even steady names compound a little

/**
 * Temper a raw historical CAGR into a rate we're comfortable projecting 5 years
 * forward. Caps the top, applies a maturity haircut, floors the bottom. A stock
 * that did 80%/yr won't be projected at 80% — that's how people buy tops.
 */
export function temperCagr(rawCagrPct: number | null): number | null {
  if (rawCagrPct == null || !Number.isFinite(rawCagrPct)) return null;
  if (rawCagrPct <= 0) return null; // don't project a declining history upward
  const capped = Math.min(rawCagrPct, MAX_PROJECTED_CAGR);
  const haircut = capped * CAGR_HAIRCUT;
  return Math.max(MIN_PROJECTED_CAGR, haircut);
}

// --- Conviction --------------------------------------------------------------
// fitScore (0–100) already encodes "steady compounder vs lottery ticket": it's
// risk-adjusted return minus a drawdown penalty. That's our backbone. Analyst
// consensus nudges it — a great compounder Wall Street also likes earns more
// trust; strong disagreement pulls it back a notch.
const HIGH_FIT = 65; // durable compounder territory
const LOW_FIT = 35; // choppy / drawdown-scarred

/** Net analyst lean: +1 bullish, -1 bearish, 0 mixed/none. */
export function consensusLean(c: Consensus): -1 | 0 | 1 {
  if (!c) return 0;
  const bull = c.strongBuy + c.buy;
  const bear = c.sell + c.strongSell;
  if (bull >= 2 * Math.max(bear, 1) && bull > c.hold) return 1;
  if (bear >= bull) return -1;
  return 0;
}

/**
 * Map fitScore + analyst lean → conviction. fitScore sets the base tier; a
 * bullish consensus can promote a borderline name one step, a bearish one can
 * demote it. Deliberately transparent — no black box.
 */
export function deriveConviction(
  fitScore: number | null,
  lean: -1 | 0 | 1,
): Conviction {
  if (fitScore == null) return "MEDIUM"; // no history → neutral default

  let tier = fitScore >= HIGH_FIT ? 2 : fitScore >= LOW_FIT ? 1 : 0; // 0..2

  // Only nudge when the score is near a boundary — a clearly great or clearly
  // weak backtest shouldn't be overturned by analysts alone.
  const nearHigh = fitScore >= HIGH_FIT - 10 && fitScore < HIGH_FIT;
  const nearLow = fitScore >= LOW_FIT && fitScore < LOW_FIT + 10;
  if (lean === 1 && nearHigh) tier = Math.min(2, tier + 1);
  if (lean === -1 && nearLow) tier = Math.max(0, tier - 1);

  return tier === 2 ? "HIGH" : tier === 1 ? "MEDIUM" : "LOW";
}

// --- Target price ------------------------------------------------------------
/** Compound `price` forward `years` at `cagrPct`. Returns null on bad input. */
export function projectTarget(
  price: number | null,
  cagrPct: number | null,
  years: number,
): number | null {
  if (price == null || price <= 0 || cagrPct == null) return null;
  const target = price * Math.pow(1 + cagrPct / 100, years);
  // Round to a sensible precision: cents under $10, whole-ish above.
  return target >= 10 ? Math.round(target * 100) / 100 : Math.round(target * 10000) / 10000;
}

// --- Full suggestion ---------------------------------------------------------
/**
 * Produce the auto-fill suggestion for the journal form. `price` is the live
 * quote (entry snapshot); `stats` is the backtest over multi-year history;
 * `consensus` is Finnhub's analyst counts (may be null). Direction is assumed
 * BULLISH for the compounding target — the journal defaults to bullish, and a
 * long-term-compound target only makes sense for a long you intend to hold.
 */
export function suggestThesis(
  price: number | null,
  stats: BacktestStats,
  consensus: Consensus,
): ThesisSuggestion {
  const lean = consensusLean(consensus);
  const conviction = deriveConviction(stats.fitScore, lean);

  const projectedCagrPct = temperCagr(stats.annualizedPct);
  const targetPrice = projectTarget(price, projectedCagrPct, HORIZON_YEARS);
  const targetMultiple =
    targetPrice != null && price != null && price > 0
      ? Math.round((targetPrice / price) * 100) / 100
      : null;

  const confident = stats.fitScore != null && stats.years >= 1;

  const rationale = buildRationale({
    conviction,
    stats,
    projectedCagrPct,
    targetMultiple,
    lean,
    confident,
  });

  return {
    conviction,
    targetPrice,
    horizonYears: HORIZON_YEARS,
    targetMultiple,
    projectedCagrPct,
    rationale,
    confident,
  };
}

function buildRationale(a: {
  conviction: Conviction;
  stats: BacktestStats;
  projectedCagrPct: number | null;
  targetMultiple: number | null;
  lean: -1 | 0 | 1;
  confident: boolean;
}): string {
  if (!a.confident) {
    return "Not enough price history to backtest — starting you at Medium with no target. Add your own read.";
  }
  const fit = a.stats.fitScore != null ? Math.round(a.stats.fitScore) : "?";
  const cagr =
    a.stats.annualizedPct != null ? `${a.stats.annualizedPct.toFixed(0)}%/yr` : "—";
  const dd =
    a.stats.maxDrawdownPct != null
      ? `${Math.abs(Math.round(a.stats.maxDrawdownPct))}% worst drop`
      : "—";
  const leanTxt =
    a.lean === 1 ? "analysts bullish" : a.lean === -1 ? "analysts cautious" : "analysts mixed";

  let target = "no target";
  if (a.projectedCagrPct != null && a.targetMultiple != null) {
    target = `~${a.projectedCagrPct.toFixed(0)}%/yr tempered → ${a.targetMultiple}× in ${HORIZON_YEARS}yr`;
  }

  return `${a.conviction} conviction — fit ${fit}/100 (${cagr}, ${dd}, ${leanTxt}). Long-term target: ${target}.`;
}
