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

// The keyless free tier accepts at most 365 days of daily history; 366+ → 401.
// A Demo key lifts that, so we can ask for the full range we actually need.
const KEYLESS_MAX_DAYS = 365;

/** Daily close price keyed by YYYY-MM-DD (UTC). Empty on failure. */
export async function getCryptoDailyCloses(
  symbol: string,
  fromDate: string,
): Promise<Record<string, number>> {
  const id = CRYPTO_IDS[symbol.toUpperCase()];
  if (!id) return {};

  const key = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = {};
  if (key) headers["x-cg-demo-api-key"] = key;

  // Days back we'd like. CoinGecko takes a day count, not a range.
  const fromMs = new Date(fromDate).getTime();
  const wanted = Math.max(1, Math.ceil((Date.now() - fromMs) / 86400000));

  // Without a key we MUST clamp to the keyless cap — asking for even one day
  // more returns 401 and no data (which previously wiped the whole series).
  const days = key ? wanted : Math.min(wanted, KEYLESS_MAX_DAYS);

  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 21600 }, // 6h — historical crypto closes barely move
    });
    if (!res.ok) return {};
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

/** True when a Demo key is present (unlocks >365-day crypto history). */
export function cryptoDeepHistoryEnabled(): boolean {
  return Boolean(process.env.COINGECKO_API_KEY);
}
