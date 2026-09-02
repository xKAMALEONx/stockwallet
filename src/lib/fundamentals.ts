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
