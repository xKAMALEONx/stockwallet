import "server-only";

// Historical daily crypto prices from CoinGecko. Alpaca's stock-bars endpoint
// has no crypto, so this fills that gap for the equity-curve backfill. Keyless
// free tier caps `market_chart?days=N` at ~365 days; a CoinGecko Demo key
// (COINGECKO_API_KEY, sent as x-cg-demo-api-key) unlocks the deeper range so we
// can reach the earliest trades. Read-only price data.

// Known crypto tickers → CoinGecko ids (mirrors quotes.ts; kept local so this
// module has no import cycle with the live-quote layer).
const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  DOGE: "dogecoin",
  SOL: "solana",
  ADA: "cardano",
  LTC: "litecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  MATIC: "matic-network",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  UNI: "uniswap",
  ATOM: "cosmos",
  ETC: "ethereum-classic",
  SHIB: "shiba-inu",
};

export function isCryptoSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in CRYPTO_IDS;
}

/** Daily close price keyed by YYYY-MM-DD (UTC). Empty on failure. */
export async function getCryptoDailyCloses(
  symbol: string,
  fromDate: string,
): Promise<Record<string, number>> {
  const id = CRYPTO_IDS[symbol.toUpperCase()];
  if (!id) return {};

  // How many days back do we need? CoinGecko takes a day count, not a range,
  // on the keyless endpoint.
  const fromMs = new Date(fromDate).getTime();
  const days = Math.ceil((Date.now() - fromMs) / 86400000) + 1;

  const key = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = {};
  // Demo keys unlock the full range; without one, CoinGecko clamps to ~365d.
  if (key) headers["x-cg-demo-api-key"] = key;

  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 21600 }, // 6h — historical crypto closes barely move
    });
    if (!res.ok) {
      // Deep range rejected (no key) → retry clamped to the keyless max.
      if ((res.status === 401 || res.status === 400) && days > 365) {
        return getCryptoDailyCloses(symbol, isoDaysAgo(365));
      }
      return {};
    }
    const data = (await res.json()) as { prices?: [number, number][] };
    const out: Record<string, number> = {};
    for (const [ts, price] of data.prices ?? []) {
      out[new Date(ts).toISOString().slice(0, 10)] = price;
    }
    return out;
  } catch {
    return {};
  }
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/** True when a Demo key is present (unlocks >365-day crypto history). */
export function cryptoDeepHistoryEnabled(): boolean {
  return Boolean(process.env.COINGECKO_API_KEY);
}
