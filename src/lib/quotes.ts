import "server-only";

// Live quotes. Stocks come from Finnhub (/quote); crypto from CoinGecko
// (Finnhub /quote is stocks-only). Both return price + day change %.
// Finnhub /quote: c (current), d (day $), dp (day %). CoinGecko simple/price:
// usd + usd_24h_change.

export type Quote = {
  price: number;
  change: number; // day change in $
  changePct: number; // day change in %
};

// Known crypto tickers → CoinGecko ids. Expand as needed.
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

function isCrypto(symbol: string): boolean {
  return symbol in CRYPTO_IDS;
}

async function fetchStockQuote(
  symbol: string,
  key: string,
): Promise<Quote | undefined> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return undefined;
    const d = (await res.json()) as { c?: number; d?: number; dp?: number };
    if (typeof d.c === "number" && d.c > 0) {
      return { price: d.c, change: d.d ?? 0, changePct: d.dp ?? 0 };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchCryptoQuotes(
  symbols: string[],
): Promise<Record<string, Quote | undefined>> {
  const out: Record<string, Quote | undefined> = {};
  const ids = symbols.map((s) => CRYPTO_IDS[s]);
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return out;
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    for (const symbol of symbols) {
      const d = data[CRYPTO_IDS[symbol]];
      if (d && typeof d.usd === "number") {
        const pct = typeof d.usd_24h_change === "number" ? d.usd_24h_change : 0;
        const price = d.usd;
        const change = price - price / (1 + pct / 100);
        out[symbol] = { price, change, changePct: pct };
      }
    }
  } catch {
    // Leave crypto unquoted on failure.
  }
  return out;
}

/** Full quote data (price + day change) keyed by uppercase symbol. */
export async function getQuoteData(
  symbols: string[],
): Promise<Record<string, Quote | undefined>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (unique.length === 0) return {};

  const cryptos = unique.filter(isCrypto);
  const stocks = unique.filter((s) => !isCrypto(s));
  const key = process.env.FINNHUB_API_KEY;

  const out: Record<string, Quote | undefined> = {};
  await Promise.all([
    (async () => {
      if (cryptos.length) Object.assign(out, await fetchCryptoQuotes(cryptos));
    })(),
    (async () => {
      if (key && stocks.length) {
        const results = await Promise.all(
          stocks.map(async (s): Promise<[string, Quote | undefined]> => [
            s,
            await fetchStockQuote(s, key),
          ]),
        );
        for (const [s, q] of results) out[s] = q;
      }
    })(),
  ]);
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

/** Stock quotes need a Finnhub key; crypto (CoinGecko) always works. */
export function quotesEnabled(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}
