import { Prisma } from "@prisma/client";

// Income Buddy allocation engine. Pure math, no DB, no currency awareness.
//
// Design (why it's shaped this way):
//  - The engine only ever needs ONE number for necessities: the monthly
//    essentials TARGET. It never cares WHAT the necessities are (rent, phone,
//    remittance…). Those live as freeform labeled rows for the human's benefit
//    and simply SUM to the target. That's what makes this work in any country
//    and any life situation — no global category taxonomy, no clutter.
//  - Variable income (tips) + fixed costs (rent) means a flat percentage lies.
//    So we fill essentials FIRST for the month, then split only the OVERFLOW.
//  - All money runs in Decimal — never floating point. Cents are conserved:
//    the "free" bucket absorbs rounding so the parts always re-sum to the whole.

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | string | number;

/** One freeform necessity line. Label is for the human; only `amount` feeds math. */
export type EssentialRow = {
  label: string;
  amount: DecimalInput;
};

/** Overflow split ratios. Whole-number percents that must sum to 100. */
export type SplitRatios = {
  portfolioPct: number;
  savingsPct: number;
  freePct: number;
};

/** The result of allocating a single shift's earnings. Parts always re-sum to `earnings`. */
export type Allocation = {
  toEssentials: Decimal;
  toPortfolio: Decimal;
  toSavings: Decimal;
  toFree: Decimal;
};

/** Sum freeform essentials rows into the single monthly target the engine uses. */
export function essentialsTarget(rows: EssentialRow[]): Decimal {
  return rows.reduce((sum, r) => sum.plus(new Dec(r.amount)), new Dec(0));
}

/** True iff the split ratios are each >= 0 and sum to exactly 100. */
export function isValidSplit(split: SplitRatios): boolean {
  const { portfolioPct, savingsPct, freePct } = split;
  if ([portfolioPct, savingsPct, freePct].some((p) => !Number.isInteger(p) || p < 0)) {
    return false;
  }
  return portfolioPct + savingsPct + freePct === 100;
}

/** Round a Decimal to cents (2 dp), banker-neutral half-up to match money display. */
function cents(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Allocate one shift's take-home pay.
 *
 * @param earnings            total take-home for this shift (tips + wage)
 * @param target              monthly essentials target (sum of freeform rows)
 * @param essentialsFundedMTD essentials already funded this calendar month, BEFORE this shift
 * @param split               overflow split ratios (must be valid; see isValidSplit)
 *
 * Essentials-first: top off the month's essentials target, then split whatever
 * is left over by the ratios. Once essentials are fully funded for the month,
 * `toEssentials` is 0 and the entire shift flows to the portfolio/savings/free
 * split — "rent's covered, the rest is yours to grow or enjoy."
 */
export function allocate(
  earnings: DecimalInput,
  target: DecimalInput,
  essentialsFundedMTD: DecimalInput,
  split: SplitRatios,
): Allocation {
  if (!isValidSplit(split)) {
    throw new Error("Split ratios must be non-negative integers summing to 100.");
  }

  const earn = cents(new Dec(earnings));
  if (earn.lessThan(0)) {
    throw new Error("Shift earnings cannot be negative.");
  }

  const tgt = new Dec(target);
  const funded = new Dec(essentialsFundedMTD);

  // How much essentials still needs this month (never negative, never over-funds).
  const stillNeeded = Prisma.Decimal.max(new Dec(0), tgt.minus(funded));
  const toEssentials = cents(Prisma.Decimal.min(earn, stillNeeded));

  const overflow = earn.minus(toEssentials); // already cent-aligned

  // Split the overflow. Portfolio and savings round to cents; FREE takes the
  // remainder so the three always re-sum to `overflow` exactly (no lost cent).
  const toPortfolio = cents(overflow.times(split.portfolioPct).dividedBy(100));
  const toSavings = cents(overflow.times(split.savingsPct).dividedBy(100));
  const toFree = overflow.minus(toPortfolio).minus(toSavings);

  return { toEssentials, toPortfolio, toSavings, toFree };
}

/**
 * Real hourly rate for a shift (or any set of shifts): total earnings / total hours.
 * Returns null when hours are zero (division undefined) rather than Infinity.
 */
export function hourlyRate(earnings: DecimalInput, hours: DecimalInput): Decimal | null {
  const h = new Dec(hours);
  if (h.lessThanOrEqualTo(0)) return null;
  return cents(new Dec(earnings).dividedBy(h));
}
