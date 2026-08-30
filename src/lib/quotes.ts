import "server-only";

// Live quotes via Finnhub. Dormant until FINNHUB_API_KEY is set — until then
// this returns {} and the dashboard simply shows cost basis without market value.
// (Phase 2 will add a proper caching layer; for now we lean on fetch revalidate.)

export async function getQuotes(
  symbols: string[],
): Promise<Record<string, number | undefined>> {
  const key = process.env.FINNHUB_API_KEY;
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (!key || unique.length === 0) return {};

  const out: Record<string, number | undefined> = {};
  await Promise.all(
    unique.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
          { next: { revalidate: 30 } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { c?: number };
        if (typeof data.c === "number" && data.c > 0) out[symbol] = data.c;
      } catch {
        // Network/quote failure → leave symbol unquoted; dashboard degrades gracefully.
      }
    }),
  );
  return out;
}

export function quotesEnabled(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}
