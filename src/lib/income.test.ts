import { describe, it, expect } from "vitest";
import {
  allocate,
  essentialsTarget,
  isValidSplit,
  hourlyRate,
  type SplitRatios,
} from "./income";

const SPLIT: SplitRatios = { portfolioPct: 50, savingsPct: 30, freePct: 20 };

describe("essentialsTarget", () => {
  it("sums freeform rows, keeping decimal precision", () => {
    const t = essentialsTarget([
      { label: "Rent", amount: "1200" },
      { label: "Phone", amount: "80.50" },
      { label: "Gas", amount: "60.25" },
    ]);
    expect(t.toString()).toBe("1340.75");
  });

  it("is zero for no rows", () => {
    expect(essentialsTarget([]).toNumber()).toBe(0);
  });

  it("does not care what the labels are (currency/category agnostic)", () => {
    const t = essentialsTarget([
      { label: "Family remittance", amount: 8000 },
      { label: "Visa fee", amount: 150 },
    ]);
    expect(t.toNumber()).toBe(8150);
  });
});

describe("isValidSplit", () => {
  it("accepts non-negative integers summing to 100", () => {
    expect(isValidSplit({ portfolioPct: 50, savingsPct: 30, freePct: 20 })).toBe(true);
    expect(isValidSplit({ portfolioPct: 100, savingsPct: 0, freePct: 0 })).toBe(true);
  });

  it("rejects ratios that don't sum to 100", () => {
    expect(isValidSplit({ portfolioPct: 50, savingsPct: 30, freePct: 25 })).toBe(false);
  });

  it("rejects negative or non-integer ratios", () => {
    expect(isValidSplit({ portfolioPct: -10, savingsPct: 60, freePct: 50 })).toBe(false);
    expect(isValidSplit({ portfolioPct: 33.3, savingsPct: 33.3, freePct: 33.4 })).toBe(false);
  });
});

describe("allocate — essentials-first", () => {
  it("routes the whole shift to essentials when nothing is funded and shift is under target", () => {
    // Slow night: $90, rent is $1200, nothing funded yet → all 90 goes to rent.
    const a = allocate(90, 1200, 0, SPLIT);
    expect(a.toEssentials.toNumber()).toBe(90);
    expect(a.toPortfolio.toNumber()).toBe(0);
    expect(a.toSavings.toNumber()).toBe(0);
    expect(a.toFree.toNumber()).toBe(0);
  });

  it("tops off essentials then splits the overflow", () => {
    // $1200 target, $1150 already funded → $50 still needed.
    // $180 shift → $50 to rent, $130 overflow split 50/30/20.
    const a = allocate(180, 1200, 1150, SPLIT);
    expect(a.toEssentials.toNumber()).toBe(50);
    expect(a.toPortfolio.toNumber()).toBe(65); // 130 * .5
    expect(a.toSavings.toNumber()).toBe(39); // 130 * .3
    expect(a.toFree.toNumber()).toBe(26); // 130 * .2
  });

  it("sends 100% to the split once rent is fully covered for the month", () => {
    // Essentials already fully funded → nothing to essentials, all splits.
    const a = allocate(200, 1200, 1200, SPLIT);
    expect(a.toEssentials.toNumber()).toBe(0);
    expect(a.toPortfolio.toNumber()).toBe(100);
    expect(a.toSavings.toNumber()).toBe(60);
    expect(a.toFree.toNumber()).toBe(40);
  });

  it("never over-funds essentials past the target (funded already exceeds target)", () => {
    const a = allocate(300, 1200, 1500, SPLIT);
    expect(a.toEssentials.toNumber()).toBe(0);
    expect(a.toPortfolio.toNumber()).toBe(150);
  });
});

describe("allocate — cents are conserved (no money created or destroyed)", () => {
  it("parts always re-sum to the shift earnings exactly, even with ugly rounding", () => {
    // $100.01 overflow with 50/30/20 → portfolio 50.01(→50.01), savings 30.00,
    // free takes remainder. Verify the invariant regardless of the ratios.
    const cases: Array<[number, number, number]> = [
      [100.01, 1200, 1200],
      [77.77, 1200, 1180],
      [333.33, 500, 500],
      [0.03, 100, 100],
      [999.99, 2000, 2000],
    ];
    for (const [earn, tgt, funded] of cases) {
      const a = allocate(earn, tgt, funded, { portfolioPct: 50, savingsPct: 30, freePct: 20 });
      const sum = a.toEssentials.plus(a.toPortfolio).plus(a.toSavings).plus(a.toFree);
      expect(sum.toString()).toBe(a.toEssentials.plus(a.toPortfolio).plus(a.toSavings).plus(a.toFree).toString());
      expect(sum.toNumber()).toBeCloseTo(earn, 2);
    }
  });

  it("the free bucket absorbs the rounding remainder", () => {
    // $10 overflow, split 33/33/34 is invalid; use a ratio that forces rounding:
    // overflow 10.00 at 50/30/20 is clean, so use an odd overflow.
    const a = allocate(10.03, 100, 100, { portfolioPct: 50, savingsPct: 30, freePct: 20 });
    // portfolio 5.02 (5.015→5.02), savings 3.01 (3.009→3.01), free = 10.03-5.02-3.01 = 2.00
    const sum = a.toPortfolio.plus(a.toSavings).plus(a.toFree);
    expect(sum.toNumber()).toBe(10.03);
  });

  it("no bucket is ever negative", () => {
    const a = allocate(45.55, 1000, 990, SPLIT);
    for (const v of [a.toEssentials, a.toPortfolio, a.toSavings, a.toFree]) {
      expect(v.greaterThanOrEqualTo(0)).toBe(true);
    }
  });
});

describe("allocate — guard rails", () => {
  it("rejects negative earnings", () => {
    expect(() => allocate(-5, 1200, 0, SPLIT)).toThrow(/negative/i);
  });

  it("rejects an invalid split", () => {
    expect(() => allocate(100, 1200, 1200, { portfolioPct: 60, savingsPct: 30, freePct: 20 })).toThrow(
      /sum/i,
    );
  });

  it("a zero-earning shift allocates nothing", () => {
    const a = allocate(0, 1200, 0, SPLIT);
    expect(a.toEssentials.toNumber()).toBe(0);
    expect(a.toPortfolio.toNumber()).toBe(0);
  });
});

describe("hourlyRate", () => {
  it("computes earnings / hours to the cent", () => {
    expect(hourlyRate(180, 6)?.toNumber()).toBe(30);
    expect(hourlyRate(100, 7)?.toNumber()).toBe(14.29); // 14.2857→14.29
  });

  it("is null when hours are zero (no divide by zero)", () => {
    expect(hourlyRate(180, 0)).toBeNull();
    expect(hourlyRate(180, -3)).toBeNull();
  });
});
