import { Prisma } from "@prisma/client";
import type { EngineTxn } from "@/lib/portfolio";
import type { DividendInput } from "@/lib/dividends";

// Pure equity-curve reconstruction. Given the raw ledger + dividends + a table
// of historical daily closes, rebuild what the portfolio was worth on each past
// calendar day — the same shape captureSnapshot() writes live, just for history.
//
// Kept free of I/O and Prisma-client calls so it's fully unit-testable; the
// server-only orchestrator (backfill-source.ts) feeds it real data.

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type DatedDividend = DividendInput & { paidAt: Date };

/** Historical daily closes: symbol (uppercase) → { "YYYY-MM-DD": close }. */
export type CloseTable = Record<string, Record<string, number>>;

export type ReconstructedRow = {
  date: string; // YYYY-MM-DD (UTC)
  marketValue: Decimal;
  costBasis: Decimal;
  dividendsTotal: Decimal;
  spyPrice: number | null;
  /** Symbols held that day with no historical close — row is skipped if any. */
  missing: string[];
};

/** UTC YYYY-MM-DD for a Date. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every UTC calendar day from `start` through `end` inclusive. */
export function eachDay(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cur.getTime() <= last) {
    out.push(ymd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Shares held per symbol *as of the end of* day `dateStr`, by replaying the
 * ledger through that day. BUY adds, SELL subtracts; snapped to zero when
 * fully closed (mirrors computePositions). Cost basis tracked in parallel so
 * the reconstructed row carries the same basis the live snapshot would.
 */
export function positionsAsOf(
  txns: EngineTxn[],
  dateStr: string,
): { shares: Map<string, Decimal>; costBasis: Decimal } {
  const cutoff = `${dateStr}T23:59:59.999Z`;
  const cutoffMs = new Date(cutoff).getTime();

  const bySymbol = new Map<string, EngineTxn[]>();
  for (const t of txns) {
    if (t.tradedAt.getTime() > cutoffMs) continue;
    const key = t.symbol.toUpperCase();
    const arr = bySymbol.get(key) ?? [];
    arr.push(t);
    bySymbol.set(key, arr);
  }

  const shares = new Map<string, Decimal>();
  let totalBasis = new Dec(0);

  for (const [symbol, list] of bySymbol) {
    const sorted = [...list].sort(
      (a, b) => a.tradedAt.getTime() - b.tradedAt.getTime(),
    );
    let sh = new Dec(0);
    let basis = new Dec(0);
    for (const t of sorted) {
      const qty = new Dec(t.quantity);
      const price = new Dec(t.price);
      const fees = new Dec(t.fees ?? 0);
      if (t.side === "BUY") {
        sh = sh.plus(qty);
        basis = basis.plus(qty.mul(price).plus(fees));
      } else {
        const avg = sh.gt(0) ? basis.div(sh) : new Dec(0);
        basis = basis.minus(avg.mul(qty));
        sh = sh.minus(qty);
        if (sh.lte(0)) {
          sh = new Dec(0);
          basis = new Dec(0);
        }
      }
    }
    if (sh.gt(0)) {
      shares.set(symbol, sh);
      totalBasis = totalBasis.plus(basis);
    }
  }

  return { shares, costBasis: totalBasis };
}

/** Cumulative dividend income received on or before `dateStr`. */
export function dividendsAsOf(divs: DatedDividend[], dateStr: string): Decimal {
  const cutoffMs = new Date(`${dateStr}T23:59:59.999Z`).getTime();
  let sum = new Dec(0);
  for (const d of divs) {
    if (d.paidAt.getTime() <= cutoffMs) sum = sum.plus(new Dec(d.amount));
  }
  return sum;
}

/**
 * Reconstruct one snapshot row for `dateStr`. Returns null when the portfolio
 * held nothing that day (nothing worth recording). If a held symbol has no
 * close on that day, its symbol lands in `missing` and the caller decides
 * whether to skip (we do — a partial value would be misleading).
 */
export function reconstructRow(
  dateStr: string,
  txns: EngineTxn[],
  divs: DatedDividend[],
  closes: CloseTable,
): ReconstructedRow | null {
  const { shares, costBasis } = positionsAsOf(txns, dateStr);
  if (shares.size === 0) return null;

  let marketValue = new Dec(0);
  const missing: string[] = [];

  for (const [symbol, sh] of shares) {
    const close = closes[symbol]?.[dateStr];
    if (close == null) {
      missing.push(symbol);
      continue;
    }
    marketValue = marketValue.plus(sh.mul(new Dec(close)));
  }

  const spyPrice = closes["SPY"]?.[dateStr] ?? null;

  return {
    date: dateStr,
    marketValue,
    costBasis,
    dividendsTotal: dividendsAsOf(divs, dateStr),
    spyPrice: typeof spyPrice === "number" ? spyPrice : null,
    missing,
  };
}

/**
 * Reconstruct the full curve across [start, end]. Rows with any missing close
 * are dropped (honest-curve rule). Non-trading days (weekends/holidays) carry
 * forward the last available close per symbol so the curve doesn't gap — we do
 * that carry-forward in buildCloseLookup before calling this.
 */
export function reconstructCurve(
  start: Date,
  end: Date,
  txns: EngineTxn[],
  divs: DatedDividend[],
  closes: CloseTable,
): ReconstructedRow[] {
  return reconstructCurveDetailed(start, end, txns, divs, closes).rows;
}

/**
 * Same as reconstructCurve but also reports how many held days were dropped for
 * lacking a close (diagnostics for the backfill route).
 */
export function reconstructCurveDetailed(
  start: Date,
  end: Date,
  txns: EngineTxn[],
  divs: DatedDividend[],
  closes: CloseTable,
): { rows: ReconstructedRow[]; dropped: number } {
  const rows: ReconstructedRow[] = [];
  let dropped = 0;
  for (const dateStr of eachDay(start, end)) {
    const row = reconstructRow(dateStr, txns, divs, closes);
    if (!row) continue; // held nothing that day — not a drop
    if (row.missing.length === 0) rows.push(row);
    else dropped++;
  }
  return { rows, dropped };
}

/**
 * Fill weekend/holiday gaps: for each symbol, carry the last known close
 * forward across [start, end] so a Saturday inherits Friday's price. Markets
 * close but portfolios still have value. Returns a new CloseTable; input is
 * untouched.
 */
export function fillForward(
  closes: CloseTable,
  start: Date,
  end: Date,
): CloseTable {
  const days = eachDay(start, end);
  const out: CloseTable = {};
  for (const [symbol, series] of Object.entries(closes)) {
    const filled: Record<string, number> = {};
    let last: number | null = null;
    for (const day of days) {
      if (series[day] != null) last = series[day];
      if (last != null) filled[day] = last;
    }
    out[symbol] = filled;
  }
  return out;
}
