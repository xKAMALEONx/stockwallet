import { Prisma } from "@prisma/client";
import { allocate, type SplitRatios } from "./income";

// Income Buddy backtest. Pure & testable: replay a chronological series of real
// (or sample) shifts through the allocation rule and prove it keeps you SOLVENT.
//
// Why this exists (the pro's question): it's not enough that the engine's math
// re-sums to the cent — the real risk is behavioral/temporal. Rent is a bill
// that comes DUE on a day, in full. Tips are lumpy. So the only honest proof
// that essentials-first is SAFE is to replay your actual past and check: did
// the essentials bucket ever fail to cover the rent when it came due? One
// overdraft in a year means the target is set wrong — fix it before a real
// dollar is ever allocated.
//
// This is DESCRIPTIVE, not predictive: it reports what WOULD have happened to
// your buffer under the rule, given shifts that already occurred.

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | string | number;

/** One shift in the replay. `date` is ISO (YYYY-MM-DD); only month/order matter. */
export type ShiftRecord = {
  date: string;
  hours: DecimalInput;
  earnings: DecimalInput;
};

export type BacktestConfig = {
  /** Monthly essentials target (sum of the freeform rows). */
  essentialsTarget: DecimalInput;
  /** Overflow split ratios (validated by allocate()). */
  split: SplitRatios;
  /**
   * Day of month the essentials bill is paid (1–28 to stay valid in every
   * month). On this day the full monthly target is withdrawn from the
   * essentials bucket; if the bucket can't cover it, that's an overdraft.
   * Default 1 (rent due on the 1st — the common worst case, since little may
   * be funded yet early in the month).
   */
  billDay?: number;
  /** Carry leftover essentials-bucket cash into next month? Default false
   *  (each month must stand on its own — the strict safety test). */
  carryEssentials?: boolean;
};

export type MonthResult = {
  month: string; // YYYY-MM
  shifts: number;
  earned: Decimal;
  essentialsFunded: Decimal; // allocated to essentials this month
  billPaid: boolean; // was rent covered when due?
  shortfall: Decimal; // how short the bucket was when the bill hit (0 if covered)
  toPortfolio: Decimal;
  toSavings: Decimal;
  toFree: Decimal;
};

export type BacktestResult = {
  months: number;
  totalShifts: number;
  totalEarned: Decimal;
  overdraftMonths: number; // months the essentials bill wasn't fully covered
  worstShortfall: Decimal; // deepest single-month shortfall
  totalToPortfolio: Decimal;
  totalToSavings: Decimal;
  totalToFree: Decimal;
  /** THE VERDICT. Safe iff the rule never left a rent bill uncovered. */
  safe: boolean;
  perMonth: MonthResult[];
};

function monthKey(iso: string): string {
  // YYYY-MM from a YYYY-MM-DD string, timezone-agnostic (no Date parsing drift).
  return iso.slice(0, 7);
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/**
 * Replay shifts through the allocation rule, month by month, tracking whether
 * the essentials bucket covered rent when it came due.
 *
 * Model per month:
 *   - Shifts in that month allocate essentials-first (the real engine).
 *   - Money allocated to essentials accumulates in an "essentials bucket".
 *   - On billDay, the full monthly target is withdrawn. If shifts BEFORE the
 *     bill day didn't fund enough, the bucket is short → overdraft recorded.
 *     (Shifts after the bill day that month still fund essentials, but a bill
 *     already missed stays missed — you can't pay late rent with next week's
 *     tips in this strict test.)
 */
export function backtest(shifts: ShiftRecord[], config: BacktestConfig): BacktestResult {
  const billDay = config.billDay ?? 1;
  const target = new Dec(config.essentialsTarget);

  // Group shifts by month, preserving chronological order within each month.
  const sorted = [...shifts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byMonth = new Map<string, ShiftRecord[]>();
  for (const s of sorted) {
    const k = monthKey(s.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(s);
  }

  const perMonth: MonthResult[] = [];
  let carried = new Dec(0); // essentials cash carried from a prior month (if enabled)

  let totalEarned = new Dec(0);
  let totalToPortfolio = new Dec(0);
  let totalToSavings = new Dec(0);
  let totalToFree = new Dec(0);
  let overdraftMonths = 0;
  let worstShortfall = new Dec(0);
  let totalShifts = 0;

  for (const [month, monthShifts] of byMonth) {
    let funded = carried; // essentials funded so far this month (incl. carry)
    let fundedBeforeBill = carried; // essentials available when the bill comes due
    let mPortfolio = new Dec(0);
    let mSavings = new Dec(0);
    let mFree = new Dec(0);
    let earned = new Dec(0);

    for (const s of monthShifts) {
      const a = allocate(s.earnings, target, funded, config.split);
      funded = funded.plus(a.toEssentials);
      if (dayOfMonth(s.date) < billDay) {
        fundedBeforeBill = fundedBeforeBill.plus(a.toEssentials);
      }
      mPortfolio = mPortfolio.plus(a.toPortfolio);
      mSavings = mSavings.plus(a.toSavings);
      mFree = mFree.plus(a.toFree);
      earned = earned.plus(new Dec(s.earnings));
      totalShifts++;
    }

    // The bill is paid from essentials funded STRICTLY BEFORE the bill day,
    // plus any carry-over from last month (fundedBeforeBill starts at `carried`).
    // This is the honest worst case: rent due on the 1st can only be paid from
    // carry, because this month's shifts haven't happened yet. Catching exactly
    // that is the whole point of the harness.
    const availableAtBill = fundedBeforeBill;

    const billPaid = availableAtBill.greaterThanOrEqualTo(target);
    const shortfall = billPaid ? new Dec(0) : target.minus(availableAtBill);
    if (!billPaid) {
      overdraftMonths++;
      if (shortfall.greaterThan(worstShortfall)) worstShortfall = shortfall;
    }

    // Carry: leftover essentials cash above the bill, if enabled.
    carried = config.carryEssentials
      ? Prisma.Decimal.max(new Dec(0), funded.minus(target))
      : new Dec(0);

    perMonth.push({
      month,
      shifts: monthShifts.length,
      earned,
      essentialsFunded: Prisma.Decimal.min(funded, target),
      billPaid,
      shortfall,
      toPortfolio: mPortfolio,
      toSavings: mSavings,
      toFree: mFree,
    });

    totalEarned = totalEarned.plus(earned);
    totalToPortfolio = totalToPortfolio.plus(mPortfolio);
    totalToSavings = totalToSavings.plus(mSavings);
    totalToFree = totalToFree.plus(mFree);
  }

  return {
    months: perMonth.length,
    totalShifts,
    totalEarned,
    overdraftMonths,
    worstShortfall,
    totalToPortfolio,
    totalToSavings,
    totalToFree,
    safe: overdraftMonths === 0,
    perMonth,
  };
}
