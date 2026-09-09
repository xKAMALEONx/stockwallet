import { describe, it, expect } from "vitest";
import { buildCurve, type SnapshotPoint } from "./equity";

function snap(
  date: string,
  marketValue: number,
  spyPrice: number | null,
  dividendsTotal = 0,
  costBasis = 0,
): SnapshotPoint {
  return { date, marketValue, costBasis, dividendsTotal, spyPrice };
}

describe("buildCurve", () => {
  it("is empty for no snapshots", () => {
    const c = buildCurve([]);
    expect(c.points).toHaveLength(0);
    expect(c.portfolioReturnPct).toBeNull();
    expect(c.outperformancePct).toBeNull();
  });

  it("indexes both series to 100 at the start", () => {
    const c = buildCurve([
      snap("2026-01-01", 1000, 400),
      snap("2026-01-02", 1100, 420),
    ]);
    expect(c.points[0].portfolioIndex).toBe(100);
    expect(c.points[0].spyIndex).toBe(100);
    expect(c.points[1].portfolioIndex).toBeCloseTo(110);
    expect(c.points[1].spyIndex).toBeCloseTo(105);
  });

  it("computes outperformance vs SPY (positive = beating the index)", () => {
    const c = buildCurve([
      snap("2026-01-01", 1000, 400),
      snap("2026-01-02", 1100, 420), // +10% vs SPY +5% → +5 outperf
    ]);
    expect(c.portfolioReturnPct).toBeCloseTo(10);
    expect(c.spyReturnPct).toBeCloseTo(5);
    expect(c.outperformancePct).toBeCloseTo(5);
  });

  it("includes dividends in total portfolio value", () => {
    // Market value flat, but $50 dividends received → +5% total return.
    const c = buildCurve([
      snap("2026-01-01", 1000, 400, 0),
      snap("2026-01-02", 1000, 400, 50),
    ]);
    expect(c.points[1].portfolioValue).toBe(1050);
    expect(c.portfolioReturnPct).toBeCloseTo(5);
  });

  it("leaves SPY index null until a baseline price exists", () => {
    const c = buildCurve([
      snap("2026-01-01", 1000, null),
      snap("2026-01-02", 1100, 420),
    ]);
    expect(c.points[0].spyIndex).toBeNull();
    // Baseline is the first day SPY exists (420) → that day indexes to 100.
    expect(c.points[1].spyIndex).toBeCloseTo(100);
  });

  it("underperformance is negative", () => {
    const c = buildCurve([
      snap("2026-01-01", 1000, 400),
      snap("2026-01-02", 1020, 440), // +2% vs SPY +10%
    ]);
    expect(c.outperformancePct).toBeCloseTo(-8);
  });
});
