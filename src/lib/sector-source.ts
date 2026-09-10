import "server-only";
import { isCryptoSymbol } from "@/lib/quotes";
import { CRYPTO_SECTOR, UNKNOWN_SECTOR } from "@/lib/sectors";

// Live sector/industry lookup via Finnhub /stock/profile2 (free tier returns
// `finnhubIndustry`). Sectors basically never change, so we cache each symbol
// for the process lifetime — at most one network call per ticker, keeping us
// far under the ~60 req/min free limit. Crypto is classified locally.

type CacheEntry = { sector: string; at: number };
const cache = new Map<string, CacheEntry>();
// Re-verify a symbol's sector at most once a week (company reclassifications
// are rare but not impossible).
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchIndustry(
  symbol: string,
  key: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { finnhubIndustry?: string };
    const industry = d.finnhubIndustry?.trim();
    return industry && industry.length > 0 ? industry : null;
  } catch {
    return null;
  }
}

/**
 * Map uppercase symbols → sector name. Crypto short-circuits to "Crypto";
 * stocks hit Finnhub (cached). Anything unresolved becomes "Unknown" so the
 * breakdown is always complete and the UI can show a data gap honestly.
 */
export async function getSectors(
  symbols: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out: Record<string, string> = {};
  const key = process.env.FINNHUB_API_KEY;
  const now = Date.now();

  const toFetch: string[] = [];
  for (const s of unique) {
    if (isCryptoSymbol(s)) {
      out[s] = CRYPTO_SECTOR;
      continue;
    }
    const cached = cache.get(s);
    if (cached && now - cached.at < TTL_MS) {
      out[s] = cached.sector;
    } else {
      toFetch.push(s);
    }
  }

  if (toFetch.length && key) {
    const results = await Promise.all(
      toFetch.map(async (s): Promise<[string, string]> => {
        const industry = await fetchIndustry(s, key);
        return [s, industry ?? UNKNOWN_SECTOR];
      }),
    );
    for (const [s, sector] of results) {
      // Only cache real hits; let "Unknown" retry next time (transient miss).
      if (sector !== UNKNOWN_SECTOR) cache.set(s, { sector, at: now });
      out[s] = sector;
    }
  } else {
    // No key (or nothing to fetch) → fill remaining as Unknown.
    for (const s of toFetch) out[s] = UNKNOWN_SECTOR;
  }

  return out;
}
