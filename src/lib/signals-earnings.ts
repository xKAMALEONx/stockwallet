import "server-only";

// Wall-Street earnings signals from Finnhub (free tier):
//   1. Recent earnings SURPRISE — did the company beat or miss analyst
//      estimates last quarter? A genuine pro-grade signal: consistent beats are
//      a bullish long-term tell, repeated misses a red flag.
//   2. Upcoming earnings RADAR — is a report due soon? Earnings are the single
//      biggest scheduled event that moves a stock, so it's context you want
//      before acting on any idea.
//
// Cached a few hours; these change at most quarterly (surprise) or are static
// once scheduled (calendar).

const REVALIDATE = 21600; // 6h

export type EarningsSurprise = {
  /** Most recent reported quarter's surprise %, e.g. +3.8 means an 3.8% beat. */
  lastSurprisePct: number | null;
  /** How many of the last 4 quarters beat estimates (0..4). */
  beatsLast4: number;
  /** Quarters counted (may be < 4 for young/thin coverage). */
  quartersCounted: number;
  lastPeriod: string | null; // e.g. "2026-09-30"
};

export type UpcomingEarnings = {
  /** ISO date of the next scheduled report, or null if none known. */
  date: string | null;
  /** Whole days until the report (negative if the date already passed). */
  daysAway: number | null;
  hour: string | null; // "bmo" | "amc" | "dmh" per Finnhub, when provided
};

type RawEarnRow = {
  actual?: number | null;
  estimate?: number | null;
  surprisePercent?: number | null;
  period?: string;
};

/** Beat/miss history for the last few reported quarters. */
export async function getEarningsSurprise(
  symbol: string,
): Promise<EarningsSurprise | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as RawEarnRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Finnhub returns most-recent first. Keep the last 4 quarters with data.
    const withData = rows
      .filter((r) => typeof r.actual === "number" && typeof r.estimate === "number")
      .slice(0, 4);
    if (withData.length === 0) return null;

    let beats = 0;
    for (const r of withData) {
      if ((r.actual as number) > (r.estimate as number)) beats++;
    }
    const first = withData[0];
    const lastSurprisePct =
      typeof first.surprisePercent === "number"
        ? Math.round(first.surprisePercent * 10) / 10
        : null;

    return {
      lastSurprisePct,
      beatsLast4: beats,
      quartersCounted: withData.length,
      lastPeriod: first.period ?? null,
    };
  } catch {
    return null;
  }
}

type RawCalRow = { date?: string; hour?: string; symbol?: string };

/** Next scheduled earnings report within a forward window (default 40 days). */
export async function getUpcomingEarnings(
  symbol: string,
  windowDays = 40,
): Promise<UpcomingEarnings | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const from = new Date();
  const to = new Date(from.getTime() + windowDays * 86400000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${ymd(from)}&to=${ymd(to)}&symbol=${encodeURIComponent(symbol)}&token=${key}`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { earningsCalendar?: RawCalRow[] };
    const rows = (data.earningsCalendar ?? []).filter((r) => r.date);
    if (rows.length === 0) return { date: null, daysAway: null, hour: null };

    // Earliest upcoming date.
    rows.sort((a, b) => (a.date! < b.date! ? -1 : 1));
    const next = rows[0];
    const date = next.date!;
    const midnight = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
    const daysAway = Math.round((midnight(date) - midnight(ymd(from))) / 86400000);
    return { date, daysAway, hour: next.hour ?? null };
  } catch {
    return null;
  }
}

/** Plain-English read of the beat/miss record. */
export function earningsSummary(e: EarningsSurprise | null): {
  tone: "pos" | "neg" | "neutral";
  label: string;
} {
  if (!e || e.lastSurprisePct === null) {
    return { tone: "neutral", label: "No earnings data" };
  }
  const s = e.lastSurprisePct;
  const beatWord = s > 1 ? "Beat" : s < -1 ? "Missed" : "Met";
  const tone = s > 1 ? "pos" : s < -1 ? "neg" : "neutral";
  const streak =
    e.quartersCounted >= 3 ? ` · ${e.beatsLast4}/${e.quartersCounted} beats` : "";
  const pctText = s > 0 ? `+${s}%` : `${s}%`;
  return { tone, label: `${beatWord} est. ${pctText}${streak}` };
}
