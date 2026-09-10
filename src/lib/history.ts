import "server-only";

// Historical daily bars from Alpaca (free IEX feed). This is the "past" half of
// the buddy system — Finnhub gives live prices/news/fundamentals, Alpaca gives
// the multi-year price history we backtest against. Read-only market data;
// we never place trades. Auth via APCA-API-KEY-ID / APCA-API-SECRET-KEY headers.

const BASE = "https://data.alpaca.markets/v2/stocks/bars";

export type DailyBar = {
  date: string; // YYYY-MM-DD (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function creds(): { key: string; secret: string } | null {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return { key, secret };
}

/** True when Alpaca history is configured (keys present). */
export function historyEnabled(): boolean {
  return creds() !== null;
}

type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number };

/**
 * Daily bars for one symbol over [start, end] (YYYY-MM-DD). Follows Alpaca's
 * page_token pagination so long ranges come back complete. Returns [] on any
 * failure (missing keys, bad symbol, network) — callers degrade gracefully.
 */
export async function getDailyBars(
  symbol: string,
  start: string,
  end: string,
): Promise<DailyBar[]> {
  const c = creds();
  if (!c) return [];

  const headers = {
    "APCA-API-KEY-ID": c.key,
    "APCA-API-SECRET-KEY": c.secret,
  };

  const bars: DailyBar[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        symbols: symbol.toUpperCase(),
        timeframe: "1Day",
        start,
        end,
        limit: "10000",
        feed: "iex",
        adjustment: "split", // split-adjusted so long histories stay comparable
      });
      if (pageToken) params.set("page_token", pageToken);

      const res = await fetch(`${BASE}?${params.toString()}`, {
        headers,
        // Daily bars change once a day — cache for an hour.
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        bars?: Record<string, AlpacaBar[]>;
        next_page_token?: string | null;
      };
      const raw = data.bars?.[symbol.toUpperCase()] ?? [];
      for (const b of raw) {
        bars.push({
          date: b.t.slice(0, 10),
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          volume: b.v,
        });
      }
      pageToken = data.next_page_token ?? undefined;
    } while (pageToken);
  } catch {
    return bars; // return whatever we got before the failure
  }

  return bars;
}
