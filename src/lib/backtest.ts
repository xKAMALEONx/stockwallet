// Backtest analytics. Pure & testable: given a series of daily closes, compute
// the long-term behavior metrics the Ideas engine reasons about. These are
// DESCRIPTIVE (what a holding actually did), never predictive. Plain numbers,
// not Decimal — these are statistical ratios, not money to the cent.

export type BarClose = { date: string; close: number };

export type BacktestStats = {
  points: number; // number of daily closes used
  years: number; // span in years (calendar, approx)
  totalReturnPct: number | null; // first→last % change
  annualizedPct: number | null; // CAGR
  volatilityPct: number | null; // annualized stdev of daily returns
  maxDrawdownPct: number | null; // worst peak→trough decline (negative)
  // Blended long-term-fit score (0–100). Rewards steady compounding, penalizes
  // volatility and deep drawdowns. NOT a prediction — a summary of past behavior
  // weighted toward what serves a long-horizon investor.
  fitScore: number | null;
};

const TRADING_DAYS = 252;

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) r.push(closes[i] / prev - 1);
  }
  return r;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Worst peak-to-trough decline over the series, as a negative percent. */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = c / peak - 1;
      if (dd < worst) worst = dd;
    }
  }
  return worst * 100;
}

/**
 * Compute long-term behavior stats from daily bars. Returns nulls (not throws)
 * when there isn't enough data, so the UI degrades gracefully.
 */
export function computeStats(bars: BarClose[]): BacktestStats {
  const closes = bars.map((b) => b.close).filter((c) => c > 0);
  const n = closes.length;

  if (n < 2) {
    return {
      points: n,
      years: 0,
      totalReturnPct: null,
      annualizedPct: null,
      volatilityPct: null,
      maxDrawdownPct: null,
      fitScore: null,
    };
  }

  const first = closes[0];
  const last = closes[n - 1];
  const totalReturnPct = (last / first - 1) * 100;

  // Calendar span in years, from the dates (falls back to trading-day count).
  const dFirst = new Date(bars[0].date).getTime();
  const dLast = new Date(bars[bars.length - 1].date).getTime();
  const years =
    dLast > dFirst
      ? (dLast - dFirst) / (365.25 * 24 * 3600 * 1000)
      : n / TRADING_DAYS;

  const annualizedPct =
    years > 0 && first > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : null;

  const rets = dailyReturns(closes);
  const volatilityPct = stdev(rets) * Math.sqrt(TRADING_DAYS) * 100;
  const maxDrawdownPct = maxDrawdown(closes);

  const fitScore = computeFitScore({
    annualizedPct,
    volatilityPct,
    maxDrawdownPct,
  });

  return {
    points: n,
    years,
    totalReturnPct,
    annualizedPct,
    volatilityPct,
    maxDrawdownPct,
    fitScore,
  };
}

/**
 * Long-term-fit score, 0–100. The merged system Jaime asked for: it uses
 * historical numbers, but weights them so ORDERING rewards durable compounders
 * over lottery tickets — not raw past return (which nudges performance-chasing).
 *
 *   base   = risk-adjusted return  (CAGR relative to volatility, "how much
 *            growth per unit of stomach-churn")
 *   penalty= deep drawdowns drag the score down (a -60% history is punished
 *            even if it eventually recovered)
 *
 * Deliberately simple and transparent — a heuristic, not a black box.
 */
export function computeFitScore(s: {
  annualizedPct: number | null;
  volatilityPct: number | null;
  maxDrawdownPct: number | null;
}): number | null {
  if (s.annualizedPct == null || s.volatilityPct == null) return null;

  const vol = s.volatilityPct > 0 ? s.volatilityPct : 1;
  // Return-to-risk: an 8%/yr grower with 12% vol scores like a steady index;
  // a 40%/yr grower with 80% vol scores lower than its raw return suggests.
  const riskAdjusted = s.annualizedPct / vol; // ~0.6 is index-like

  // Map risk-adjusted return onto ~0–90. 1.0 (excellent) → 90, 0 → 0.
  let score = Math.max(0, Math.min(90, riskAdjusted * 90));

  // Drawdown penalty: subtract up to 30 pts as the worst decline deepens.
  const dd = Math.abs(s.maxDrawdownPct ?? 0); // positive magnitude
  const ddPenalty = Math.min(30, (dd / 100) * 40); // -50% dd → ~20pt hit
  score = Math.max(0, score - ddPenalty);

  return Math.round(Math.min(100, score) * 10) / 10;
}
