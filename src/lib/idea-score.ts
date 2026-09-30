// Composite "why now" scoring — the buddy system's brain. Merges the FRESH
// signals (news momentum, analyst consensus + trend, earnings beats, insider
// buying, sector momentum, today's move) with the BACKTESTED proof (long-term
// fit score) into one transparent 0–100 number, tuned for BALANCED LONG-TERM
// GROWTH.
//
// Two deliberate design choices Jaime asked for:
//   1. Buddy system: the historical fitScore is a first-class input, so an idea
//      is never recommended on hype alone — durable compounders float up.
//   2. Conflict handling: when the fresh signals are hot but the history is ugly
//      (or vice-versa), we FLAG it and DOWN-RANK it — optimize the picks without
//      hiding anything.
//
// Pure & fully unit-testable: numbers in, score + breakdown out. No I/O.

export type ScoreInputs = {
  /** News sentiment, -1..1 (from Marketaux). */
  newsSentiment: number | null;
  /** How many recent articles mention it (freshness/attention proxy). */
  mentions: number;
  /** Net analyst bullishness: (strongBuy+buy) − (sell+strongSell). */
  consensusNet: number | null;
  /** Analyst trend M/M: +1 warming, -1 cooling, 0 flat/unknown. */
  consensusDir: -1 | 0 | 1;
  /** Last-quarter earnings surprise %, e.g. +3.8 = beat by 3.8%. */
  earningsSurprisePct: number | null;
  /** Net insider dollar flow (positive = buying). */
  insiderNetValue: number | null;
  /** Trailing sector-ETF return %, the sector tailwind/headwind. */
  sectorReturnPct: number | null;
  /** Today's price move %, the "what's happening today" pulse. */
  dayChangePct: number | null;
  /** Backtested long-term fit score 0–100 (the proof half). */
  fitScore: number | null;
};

export type ScoreBreakdown = {
  /** Final composite, 0–100 (after any conflict penalty). */
  score: number;
  /** Score from fresh signals only, 0–100 (the "hype" side). */
  freshScore: number;
  /** Score from history only, 0–100 (the "proof" side) — mirrors fitScore. */
  proofScore: number;
  /** True when fresh and proof strongly disagree. */
  conflict: boolean;
  /** Human-readable one-liner for the clash, or null. */
  conflictNote: string | null;
  /** Per-signal contributions, for the "why" tooltip. */
  parts: { label: string; points: number }[];
};

// Balanced-long-term-growth weights. History (proof) and the durable Wall-Street
// signals (analyst support, earnings quality) are weighted above short-term
// noise (today's move, raw mentions). Weights sum to 100 on the fresh side; the
// final blend then mixes fresh with proof.
const W = {
  consensus: 22, // analyst net bullishness
  consensusDir: 8, // getting more bullish (upgrade proxy)
  earnings: 20, // beat/miss quality
  insider: 14, // insiders buying
  sector: 12, // sector tailwind
  news: 14, // news sentiment
  day: 4, // today's move (small — it's noise long-term)
  mentions: 6, // attention/freshness
};

// Final blend: proof (history) vs fresh. Balanced growth leans on proof.
const PROOF_WEIGHT = 0.45;
const FRESH_WEIGHT = 0.55;

// Conflict thresholds: fresh and proof are "strongly disagreeing" when they sit
// on opposite sides of the midpoint by at least this gap.
const CONFLICT_GAP = 35;
const CONFLICT_PENALTY = 15; // points shaved when a clash is detected

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Map a raw signal onto 0..1 via a soft, saturating curve. */
function sat(value: number, scale: number): number {
  // 0 → 0.5 (neutral), +scale → ~0.73, large → →1; symmetric for negatives.
  return 1 / (1 + Math.exp(-value / scale));
}

export function scoreIdea(inp: ScoreInputs): ScoreBreakdown {
  const parts: { label: string; points: number }[] = [];

  // --- Fresh side ---------------------------------------------------------
  // Each contributes 0..weight. Neutral inputs land near half their weight so a
  // data-less idea isn't unfairly punished, only un-boosted.
  const consensusUnit =
    inp.consensusNet == null ? 0.5 : sat(inp.consensusNet, 8);
  const consensusPts = consensusUnit * W.consensus;
  parts.push({ label: "Analyst consensus", points: round1(consensusPts) });

  const dirPts = ((inp.consensusDir + 1) / 2) * W.consensusDir; // -1→0, 0→half, 1→full
  parts.push({ label: "Analyst trend", points: round1(dirPts) });

  const earnUnit =
    inp.earningsSurprisePct == null ? 0.5 : sat(inp.earningsSurprisePct, 5);
  const earnPts = earnUnit * W.earnings;
  parts.push({ label: "Earnings beat/miss", points: round1(earnPts) });

  const insiderUnit =
    inp.insiderNetValue == null || inp.insiderNetValue === 0
      ? 0.5
      : inp.insiderNetValue > 0
        ? 0.85
        : 0.4; // buying rewarded; selling only mildly discounted
  const insiderPts = insiderUnit * W.insider;
  parts.push({ label: "Insider activity", points: round1(insiderPts) });

  const sectorUnit =
    inp.sectorReturnPct == null ? 0.5 : sat(inp.sectorReturnPct, 8);
  const sectorPts = sectorUnit * W.sector;
  parts.push({ label: "Sector momentum", points: round1(sectorPts) });

  const newsUnit = inp.newsSentiment == null ? 0.5 : sat(inp.newsSentiment * 100, 20);
  const newsPts = newsUnit * W.news;
  parts.push({ label: "News sentiment", points: round1(newsPts) });

  const dayUnit = inp.dayChangePct == null ? 0.5 : sat(inp.dayChangePct, 3);
  const dayPts = dayUnit * W.day;
  parts.push({ label: "Today's move", points: round1(dayPts) });

  const mentionsUnit = sat(inp.mentions - 2, 3); // 0 mentions → low, 5+ → high
  const mentionsPts = mentionsUnit * W.mentions;
  parts.push({ label: "News attention", points: round1(mentionsPts) });

  const freshScore = clamp(
    consensusPts +
      dirPts +
      earnPts +
      insiderPts +
      sectorPts +
      newsPts +
      dayPts +
      mentionsPts,
  );

  // --- Proof side (history) ----------------------------------------------
  // No backtest → treat as neutral 50 so news-only ideas still rank, just
  // without a compounding endorsement.
  const proofScore = inp.fitScore == null ? 50 : clamp(inp.fitScore);

  // --- Blend + conflict ---------------------------------------------------
  let score = FRESH_WEIGHT * freshScore + PROOF_WEIGHT * proofScore;

  const gap = freshScore - proofScore;
  let conflict = false;
  let conflictNote: string | null = null;
  // Only flag a clash when we actually HAVE a backtest to disagree with.
  if (inp.fitScore != null && Math.abs(gap) >= CONFLICT_GAP) {
    conflict = true;
    score = clamp(score - CONFLICT_PENALTY);
    conflictNote =
      gap > 0
        ? "News & analysts are hot, but the long-term history is rough — treat as higher risk."
        : "Solid long-term history, but the current signals are cool — may be out of favor right now.";
  }

  return {
    score: round1(clamp(score)),
    freshScore: round1(freshScore),
    proofScore: round1(proofScore),
    conflict,
    conflictNote,
    parts,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Tier label for the composite score, for badges. */
export function scoreTier(score: number): {
  label: string;
  tone: "pos" | "neg" | "neutral";
} {
  if (score >= 68) return { label: "Strong fit", tone: "pos" };
  if (score >= 50) return { label: "Worth a look", tone: "neutral" };
  return { label: "Weak fit", tone: "neg" };
}
