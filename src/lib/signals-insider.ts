import "server-only";

// Insider-activity signal from Finnhub (free tier: stock/insider-transactions).
// When company insiders (officers, directors) BUY their own stock with their own
// money, it's one of the most-studied bullish long-term tells — they know the
// business better than anyone. Routine sells are noise (options/diversification),
// so we net buys against sells and only call it a real signal on net buying.
//
// SEC transaction codes we care about:
//   P = open-market purchase (the meaningful bullish signal)
//   S = open-market sale
// Everything else (option exercises "M", grants "A", gifts "G", etc.) is
// excluded from the buy/sell tally — those aren't conviction trades.

const REVALIDATE = 21600; // 6h — SEC filings trickle in, no need for fresher

export type InsiderSignal = {
  buyCount: number; // # of open-market purchase transactions (last window)
  sellCount: number; // # of open-market sale transactions
  netShares: number; // shares bought minus shares sold (open-market only)
  /** Approx net dollar flow (Σ change*price), positive = net buying. */
  netValue: number;
  windowDays: number;
};

type RawInsiderRow = {
  transactionCode?: string;
  change?: number; // signed share delta (+ buy, - sell)
  transactionPrice?: number;
  transactionDate?: string;
};

export async function getInsiderSignal(
  symbol: string,
  windowDays = 120,
): Promise<InsiderSignal | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: RawInsiderRow[] };
    const rows = data.data ?? [];
    if (rows.length === 0) {
      return { buyCount: 0, sellCount: 0, netShares: 0, netValue: 0, windowDays };
    }

    const cutoff = Date.now() - windowDays * 86400000;
    let buyCount = 0;
    let sellCount = 0;
    let netShares = 0;
    let netValue = 0;

    for (const r of rows) {
      const code = (r.transactionCode ?? "").toUpperCase();
      if (code !== "P" && code !== "S") continue; // open-market only
      if (r.transactionDate) {
        const t = new Date(`${r.transactionDate}T00:00:00Z`).getTime();
        if (Number.isFinite(t) && t < cutoff) continue;
      }
      const change = typeof r.change === "number" ? r.change : 0;
      const price = typeof r.transactionPrice === "number" ? r.transactionPrice : 0;
      if (code === "P") buyCount++;
      else sellCount++;
      netShares += change;
      netValue += change * price;
    }

    return {
      buyCount,
      sellCount,
      netShares,
      netValue: Math.round(netValue),
      windowDays,
    };
  } catch {
    return null;
  }
}

/** Plain-English read. Only net BUYING is a real positive; the rest is neutral. */
export function insiderSummary(s: InsiderSignal | null): {
  tone: "pos" | "neg" | "neutral";
  label: string;
} {
  if (!s || (s.buyCount === 0 && s.sellCount === 0)) {
    return { tone: "neutral", label: "No insider trades" };
  }
  if (s.netValue > 0 && s.buyCount > 0) {
    return { tone: "pos", label: `Insiders buying (${s.buyCount} buy)` };
  }
  if (s.netValue < 0 && s.sellCount > s.buyCount) {
    return { tone: "neutral", label: "Insiders trimming" }; // sells alone aren't bearish
  }
  return { tone: "neutral", label: "Mixed insider activity" };
}
