import "server-only";

// Live quotes via Finnhub. Dormant until FINNHUB_API_KEY is set — until then
// this returns {} and the UI degrades gracefully.
// Finnhub /quote returns: c (current), d (day change $), dp (day change %),
// pc (prev close). Day-change comes free from the same call — no extra request.

export type Quote = {
  price: number;
  change: number; // day change in $
  changePct: number; // day change in %
};

async function fetchQuote(
  symbol: string,
  key: string,
): Promise<Quote | undefined> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return undefined;
    const d = (await res.json()) as {
      c?: number;
      d?: number;
      dp?: number;
    };
    if (typeof d.c === "number" && d.c > 0) {
      return { price: d.c, change: d.d ?? 0, changePct: d.dp ?? 0 };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Full quote data (price + day change) keyed by uppercase symbol. */
export async function getQuoteData(
  symbols: string[],
): Promise<Record<string, Quote | undefined>> {
  const key = process.env.FINNHUB_API_KEY;
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (!key || unique.length === 0) return {};

  const out: Record<string, Quote | undefined> = {};
  await Promise.all(
    unique.map(async (symbol) => {
      out[symbol] = await fetchQuote(symbol, key);
    }),
  );
  return out;
}

/** Price-only map (for the portfolio cost-basis engine). */
export async function getQuotes(
  symbols: string[],
): Promise<Record<string, number | undefined>> {
  const data = await getQuoteData(symbols);
  const out: Record<string, number | undefined> = {};
  for (const [symbol, q] of Object.entries(data)) out[symbol] = q?.price;
  return out;
}

export function quotesEnabled(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}
