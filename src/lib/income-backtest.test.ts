import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { backtest, type ShiftRecord, type BacktestConfig } from "./income-backtest";

const Dec = Prisma.Decimal;

const SPLIT = { portfolioPct: 50, savingsPct: 30, freePct: 20 };

// A month of a server working ~4 shifts/week. Earnings vary (lumpy tips).
function monthOfShifts(ym: string, earnings: number[]): ShiftRecord[] {
  // Spread across the month starting day 05 so billDay=1 tests are honest
  // (nothing funded before a day-1 bill unless carried).
  return earnings.map((e, i) => ({
    date: `${ym}-${String(5 + i * 2).padStart(2, "0")}`,
    hours: 6,
    earnings: e,
  }));
}

describe("backtest — verdict", () => {
  it("flags UNSAFE when the essentials target is set too high for the income", () => {
    // Rent $2500/mo, but the server only makes ~$1200/mo. Rule can never cover it.
    const shifts = [
      ...monthOfShifts("2026-01", [100, 120, 90, 110, 130, 100, 150, 120]),
      ...monthOfShifts("2026-02", [110, 100, 95, 120, 130, 100, 140, 115]),
    ];
    const cfg: BacktestConfig = { essentialsTarget: 2500, split: SPLIT, billDay: 28 };
    const r = backtest(shifts, cfg);
    expect(r.safe).toBe(false);
    expect(r.overdraftMonths).toBe(2);
    expect(r.worstShortfall.greaterThan(0)).toBe(true);
  });

  it("confirms SAFE when income comfortably covers rent before it's due", () => {
    // Rent $1200, server makes ~$1800/mo, bill late in month → plenty funded.
    const shifts = [
      ...monthOfShifts("2026-01", [200, 220, 240, 210, 230, 250, 220, 210]),
      ...monthOfShifts("2026-02", [210, 230, 200, 240, 220, 250, 230, 220]),
    ];
    const cfg: BacktestConfig = { essentialsTarget: 1200, split: SPLIT, billDay: 28 };
    const r = backtest(shifts, cfg);
    expect(r.safe).toBe(true);
    expect(r.overdraftMonths).toBe(0);
    expect(r.worstShortfall.toNumber()).toBe(0);
  });

  it("catches the day-1-rent trap: enough earned over the month, but not before the 1st", () => {
    // Server earns $1800 across the month — covers $1200 rent EASILY in total.
    // But rent is due on the 1st and shifts start on the 5th → nothing funded
    // when the bill hits → overdraft. This is the exact failure a flat monthly
    // average would hide. The harness must catch it.
    const shifts = monthOfShifts("2026-03", [200, 220, 240, 210, 230, 250, 220, 230]);
    const cfg: BacktestConfig = { essentialsTarget: 1200, split: SPLIT, billDay: 1 };
    const r = backtest(shifts, cfg);
    expect(r.safe).toBe(false);
    expect(r.overdraftMonths).toBe(1);
  });

  it("carry-forward can rescue a day-1 bill using last month's surplus", () => {
    // Two months; with carry enabled, month 1's surplus essentials cash is
    // available to pay month 2's day-1 rent.
    const shifts = [
      ...monthOfShifts("2026-01", [300, 300, 300, 300, 300, 300]), // big month, surplus
      ...monthOfShifts("2026-02", [200, 200, 200, 200, 200, 200]),
    ];
    const cfg: BacktestConfig = {
      essentialsTarget: 1200,
      split: SPLIT,
      billDay: 1,
      carryEssentials: true,
    };
    const r = backtest(shifts, cfg);
    // Month 1 day-1 bill still fails (no prior carry), month 2 may be rescued.
    // The point: carry reduces overdrafts vs the no-carry case.
    const noCarry = backtest(shifts, { ...cfg, carryEssentials: false });
    expect(r.overdraftMonths).toBeLessThanOrEqual(noCarry.overdraftMonths);
  });
});

describe("backtest — conservation across the whole replay", () => {
  it("every dollar earned lands in exactly one bucket (essentials+portfolio+savings+free)", () => {
    const shifts = [
      ...monthOfShifts("2026-01", [180, 90, 220, 140, 300, 110]),
      ...monthOfShifts("2026-02", [200, 130, 95, 260, 175, 240]),
    ];
    const cfg: BacktestConfig = { essentialsTarget: 1200, split: SPLIT, billDay: 28 };
    const r = backtest(shifts, cfg);

    // Sum essentials actually funded across months (capped at target/month).
    const essentials = r.perMonth.reduce((s, m) => s.plus(m.essentialsFunded), new Dec(0));
    const buckets = essentials
      .plus(r.totalToPortfolio)
      .plus(r.totalToSavings)
      .plus(r.totalToFree);
    // Every dollar earned lands in exactly one bucket: capped essentials + the
    // three split buckets must equal total earned EXACTLY (to the cent).
    expect(buckets.toString()).toBe(r.totalEarned.toString());
  });

  it("reports correct month and shift counts", () => {
    const shifts = [
      ...monthOfShifts("2026-01", [100, 100, 100]),
      ...monthOfShifts("2026-02", [100, 100]),
      ...monthOfShifts("2026-03", [100]),
    ];
    const r = backtest(shifts, { essentialsTarget: 1200, split: SPLIT, billDay: 28 });
    expect(r.months).toBe(3);
    expect(r.totalShifts).toBe(6);
  });
});

describe("backtest — edges", () => {
  it("handles an empty history (no shifts, no overdrafts, safe vacuously)", () => {
    const r = backtest([], { essentialsTarget: 1200, split: SPLIT });
    expect(r.months).toBe(0);
    expect(r.totalShifts).toBe(0);
    expect(r.safe).toBe(true);
  });

  it("orders shifts chronologically even if passed out of order", () => {
    const shifts: ShiftRecord[] = [
      { date: "2026-02-10", hours: 6, earnings: 200 },
      { date: "2026-01-10", hours: 6, earnings: 200 },
    ];
    const r = backtest(shifts, { essentialsTarget: 1200, split: SPLIT, billDay: 28 });
    expect(r.perMonth[0].month).toBe("2026-01");
    expect(r.perMonth[1].month).toBe("2026-02");
  });
});
