import "server-only";

// Long-term lens from Finnhub (free tier): analyst consensus + basic valuation.
// Cached ~6h since these move slowly.

export type Consensus = {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  period: string;
} | null;

export type Fundamentals = {
  peTTM: number | null;
  week52High: number | null;
  week52Low: number | null;
  // Extra inputs for earnings-based fair value (all Finnhub free tier).
  forwardPE: number | null;
  epsTTM: number | null;
  epsGrowth5Y: number | null; // percent, may be negative
  epsGrowth3Y: number | null; // percent
  beta: number | null;
} | null;

const REVALIDATE = 21600; // 6h

export async function getConsensus(symbol: string): Promise<Consensus> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
      period: string;
    }>;
    if (Array.isArray(arr) && arr.length > 0) {
      const l = arr[0];
      return {
        strongBuy: l.strongBuy,
        buy: l.buy,
        hold: l.hold,
        sell: l.sell,
        strongSell: l.strongSell,
        period: l.period,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type ConsensusTrend = {
  /** Net bullishness now: (strongBuy+buy) - (sell+strongSell), latest month. */
  scoreNow: number;
  /** Same, one month prior (null if only one period available). */
  scorePrev: number | null;
  /** "up" if analysts got more bullish M/M, "down" if less, "flat" otherwise. */
  direction: "up" | "down" | "flat";
} | null;

/**
 * Direction of analyst sentiment over the last two months — a free-tier proxy
 * for the premium upgrade/downgrade feed. Rising net-bullishness means the Street
 * is warming up to the name (net upgrades); falling means cooling.
 */
export async function getConsensusTrend(symbol: string): Promise<ConsensusTrend> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const net = (l: (typeof arr)[number]) =>
      l.strongBuy + l.buy - (l.sell + l.strongSell);
    const scoreNow = net(arr[0]);
    const scorePrev = arr.length > 1 ? net(arr[1]) : null;
    let direction: "up" | "down" | "flat" = "flat";
    if (scorePrev !== null) {
      if (scoreNow > scorePrev) direction = "up";
      else if (scoreNow < scorePrev) direction = "down";
    }
    return { scoreNow, scorePrev, direction };
  } catch {
    return null;
  }
}

export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { metric?: Record<string, number> };
    const m = d.metric ?? {};
    return {
      peTTM: m.peTTM ?? null,
      week52High: m["52WeekHigh"] ?? null,
      week52Low: m["52WeekLow"] ?? null,
      forwardPE: m.forwardPE ?? null,
      epsTTM: m.epsTTM ?? null,
      epsGrowth5Y: m.epsGrowth5Y ?? null,
      epsGrowth3Y: m.epsGrowth3Y ?? null,
      beta: m.beta ?? null,
    };
  } catch {
    return null;
  }
}

/** Simple bullish/bearish read from the consensus counts. */
export function consensusLabel(c: Consensus): {
  label: string;
  tone: "pos" | "neg" | "neutral";
} {
  if (!c) return { label: "No coverage", tone: "neutral" };
  const bull = c.strongBuy + c.buy;
  const bear = c.sell + c.strongSell;
  if (bull >= 2 * Math.max(bear, 1) && bull > c.hold) {
    return { label: "Bullish", tone: "pos" };
  }
  if (bear >= bull) return { label: "Bearish", tone: "neg" };
  return { label: "Mixed", tone: "neutral" };
}
