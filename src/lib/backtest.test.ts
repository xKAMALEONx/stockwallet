import { describe, it, expect } from "vitest";
import {
  computeStats,
  computeFitScore,
  maxDrawdown,
  type BarClose,
} from "./backtest";

function series(closes: number[], startDate = "2024-01-01"): BarClose[] {
  const start = new Date(startDate).getTime();
  return closes.map((close, i) => ({
    date: new Date(start + i * 86400000).toISOString().slice(0, 10),
    close,
  }));
}

describe("maxDrawdown", () => {
  it("is 0 for a monotonically rising series", () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it("captures the worst peak-to-trough decline", () => {
    // peak 200 → trough 100 = -50%
    expect(maxDrawdown([100, 200, 150, 100, 180])).toBeCloseTo(-50, 5);
  });

  it("uses the highest prior peak, not the start", () => {
    expect(maxDrawdown([100, 120, 60])).toBeCloseTo(-50, 5); // 120→60
  });
});

describe("computeStats", () => {
  it("returns nulls with fewer than 2 points", () => {
    const s = computeStats(series([100]));
    expect(s.totalReturnPct).toBeNull();
    expect(s.fitScore).toBeNull();
  });

  it("computes total return first→last", () => {
    const s = computeStats(series([100, 150]));
    expect(s.totalReturnPct).toBeCloseTo(50, 5);
  });

  it("annualizes a ~1-year doubling to ~100% CAGR", () => {
    // 366 daily points spanning ~1 year, doubling
    const closes = Array.from({ length: 366 }, (_, i) => 100 * (1 + i / 365));
    const s = computeStats(series(closes));
    expect(s.annualizedPct).not.toBeNull();
    expect(s.annualizedPct!).toBeGreaterThan(80);
    expect(s.annualizedPct!).toBeLessThan(120);
  });

  it("reports higher volatility for a choppier series", () => {
    const calm = computeStats(series([100, 101, 102, 103, 104, 105]));
    const wild = computeStats(series([100, 130, 80, 140, 70, 150]));
    expect(wild.volatilityPct!).toBeGreaterThan(calm.volatilityPct!);
  });
});

describe("computeFitScore", () => {
  it("is null without the required inputs", () => {
    expect(
      computeFitScore({ annualizedPct: null, volatilityPct: 10, maxDrawdownPct: -5 }),
    ).toBeNull();
  });

  it("rewards steady compounding over a volatile mover with the same return", () => {
    const steady = computeFitScore({
      annualizedPct: 12,
      volatilityPct: 15,
      maxDrawdownPct: -18,
    })!;
    const wild = computeFitScore({
      annualizedPct: 12,
      volatilityPct: 60,
      maxDrawdownPct: -70,
    })!;
    expect(steady).toBeGreaterThan(wild);
  });

  it("penalizes deep drawdowns", () => {
    const shallow = computeFitScore({
      annualizedPct: 15,
      volatilityPct: 20,
      maxDrawdownPct: -10,
    })!;
    const deep = computeFitScore({
      annualizedPct: 15,
      volatilityPct: 20,
      maxDrawdownPct: -60,
    })!;
    expect(shallow).toBeGreaterThan(deep);
  });

  it("stays within 0–100", () => {
    const hi = computeFitScore({
      annualizedPct: 200,
      volatilityPct: 5,
      maxDrawdownPct: -2,
    })!;
    const lo = computeFitScore({
      annualizedPct: -50,
      volatilityPct: 90,
      maxDrawdownPct: -95,
    })!;
    expect(hi).toBeLessThanOrEqual(100);
    expect(hi).toBeGreaterThanOrEqual(0);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(lo).toBeLessThanOrEqual(100);
  });
});
