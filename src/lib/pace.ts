// Auto-grading for tracked projections. When Jaime logs a pick, we store the
// entry price, the target, and the horizon (years) it should take to get there.
// This module answers, live, every time the page loads:
//
//   1. Profit/loss so far vs. the entry price (the money read).
//   2. Is the pick PACING toward the long-term projection? We build the smooth
//      compounding path from entry → target over the horizon, read where that
//      path says the price "should" be by today, and compare the real price to
//      it. Ahead / on-track / behind — no manual grading, it just updates.
//
// All pure arithmetic. Missing inputs degrade to a neutral "unknown" grade so
// the UI never breaks when a live quote or a field is absent.

export type PaceGrade = "AHEAD" | "ON_TRACK" | "BEHIND" | "HIT" | "UNKNOWN";

export type Pace = {
  grade: PaceGrade;
  /** Live profit/loss on the position vs. entry, percent. */
  returnPct: number | null;
  /** Where the compounding path says price should be *today*. */
  expectedPrice: number | null;
  /** How far ahead (+) or behind (-) the expected path, percent. */
  vsExpectedPct: number | null;
  /** Fraction of the horizon elapsed, 0–1 (clamped). */
  elapsedFrac: number | null;
  /** Plain-English one-liner for the card. */
  note: string;
};

const YEAR_MS = 365.25 * 86400000;
// Tolerance band around the expected path that still counts as "on track".
const ON_TRACK_BAND = 5; // ±5%

export function gradePace(params: {
  entryPrice: number | null;
  targetPrice: number | null;
  currentPrice: number | null;
  horizonYears: number | null;
  loggedAt: Date;
  now?: Date;
  direction?: "BULL" | "BEAR";
}): Pace {
  const {
    entryPrice,
    targetPrice,
    currentPrice,
    horizonYears,
    loggedAt,
    direction = "BULL",
  } = params;
  const now = params.now ?? new Date();

  const valid = (n: number | null | undefined): n is number =>
    n != null && Number.isFinite(n) && n > 0;

  // Money read works with just entry + current price.
  const returnPct = valid(entryPrice) && valid(currentPrice)
    ? round1((currentPrice / entryPrice - 1) * 100)
    : null;

  // Pace read needs the full projection (target + horizon).
  if (
    !valid(entryPrice) ||
    !valid(currentPrice) ||
    !valid(targetPrice) ||
    horizonYears == null ||
    horizonYears <= 0
  ) {
    return {
      grade: "UNKNOWN",
      returnPct,
      expectedPrice: null,
      vsExpectedPct: null,
      elapsedFrac: null,
      note:
        returnPct == null
          ? "Not enough data to grade yet."
          : `${signed(returnPct)}% vs. your entry.`,
    };
  }

  // Already reached the target? Call it a hit (direction-aware).
  const hit =
    direction === "BULL"
      ? currentPrice >= targetPrice
      : currentPrice <= targetPrice;
  if (hit) {
    return {
      grade: "HIT",
      returnPct,
      expectedPrice: targetPrice,
      vsExpectedPct: null,
      elapsedFrac: clamp01((now.getTime() - loggedAt.getTime()) / (horizonYears * YEAR_MS)),
      note: `Target hit — ${signed(returnPct!)}% since you logged it.`,
    };
  }

  const elapsedYears = Math.max(0, (now.getTime() - loggedAt.getTime()) / YEAR_MS);
  const elapsedFrac = clamp01(elapsedYears / horizonYears);

  // Smooth compounding path from entry to target over the horizon:
  //   expected(t) = entry * (target/entry)^(t / horizon)
  const ratio = targetPrice / entryPrice;
  const expectedPrice = round2(entryPrice * Math.pow(ratio, elapsedFrac));

  const vsExpectedPct = round1((currentPrice / expectedPrice - 1) * 100);

  // For a bearish pick, being *below* the expected path is good — flip the sign
  // so "ahead" always means "doing better than the plan".
  const signedVs = direction === "BULL" ? vsExpectedPct : -vsExpectedPct;

  let grade: PaceGrade;
  if (signedVs > ON_TRACK_BAND) grade = "AHEAD";
  else if (signedVs < -ON_TRACK_BAND) grade = "BEHIND";
  else grade = "ON_TRACK";

  return {
    grade,
    returnPct,
    expectedPrice,
    vsExpectedPct,
    elapsedFrac,
    note: buildNote(grade, returnPct, signedVs, elapsedFrac),
  };
}

function buildNote(
  grade: PaceGrade,
  returnPct: number | null,
  signedVs: number,
  elapsedFrac: number,
): string {
  const pct = elapsedFrac >= 0.995 ? "past" : `${Math.round(elapsedFrac * 100)}% into`;
  const money = returnPct == null ? "" : ` ${signed(returnPct)}% so far.`;
  if (grade === "AHEAD")
    return `Ahead of plan — ~${Math.abs(signedVs).toFixed(0)}% above the projected path, ${pct} the horizon.${money}`;
  if (grade === "BEHIND")
    return `Behind plan — ~${Math.abs(signedVs).toFixed(0)}% under the projected path, ${pct} the horizon.${money}`;
  return `On track — pacing with the projection, ${pct} the horizon.${money}`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
