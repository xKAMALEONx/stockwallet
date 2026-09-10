import { describe, it, expect } from "vitest";
import {
  temperCagr,
  consensusLean,
  deriveConviction,
  projectTarget,
  suggestThesis,
  HORIZON_YEARS,
} from "./thesis-suggest";
import type { BacktestStats } from "./backtest";
import type { Consensus } from "./fundamentals";

const stats = (o: Partial<BacktestStats>): BacktestStats => ({
  points: 500,
  years: 2,
  totalReturnPct: 50,
  annualizedPct: 20,
  volatilityPct: 25,
  maxDrawdownPct: -30,
  fitScore: 50,
  ...o,
});

const cons = (o: Partial<NonNullable<Consensus>>): Consensus => ({
  strongBuy: 0,
  buy: 0,
  hold: 0,
  sell: 0,
  strongSell: 0,
  period: "2026-09-01",
  ...o,
});

describe("temperCagr", () => {
  it("caps a runaway historical CAGR before haircut", () => {
    // 80% raw → capped to 25 → 70% haircut = 17.5
    expect(temperCagr(80)).toBeCloseTo(17.5, 5);
  });
  it("haircuts a moderate CAGR", () => {
    // 20% → 14
    expect(temperCagr(20)).toBeCloseTo(14, 5);
  });
  it("floors a tiny CAGR at the minimum", () => {
    // 3% → 2.1 haircut → floored to 4
    expect(temperCagr(3)).toBe(4);
  });
  it("refuses to project a declining/zero history upward", () => {
    expect(temperCagr(0)).toBeNull();
    expect(temperCagr(-10)).toBeNull();
    expect(temperCagr(null)).toBeNull();
  });
});

describe("consensusLean", () => {
  it("reads a clearly bullish book as +1", () => {
    expect(consensusLean(cons({ strongBuy: 8, buy: 4, hold: 2 }))).toBe(1);
  });
  it("reads a bearish book as -1", () => {
    expect(consensusLean(cons({ hold: 2, sell: 3, strongSell: 2, buy: 1 }))).toBe(-1);
  });
  it("mixed / no coverage → 0", () => {
    expect(consensusLean(cons({ buy: 2, hold: 3 }))).toBe(0);
    expect(consensusLean(null)).toBe(0);
  });
});

describe("deriveConviction", () => {
  it("high fitScore → HIGH", () => {
    expect(deriveConviction(75, 0)).toBe("HIGH");
  });
  it("mid fitScore → MEDIUM", () => {
    expect(deriveConviction(50, 0)).toBe("MEDIUM");
  });
  it("low fitScore → LOW", () => {
    expect(deriveConviction(20, 0)).toBe("LOW");
  });
  it("bullish analysts promote a borderline-high name", () => {
    expect(deriveConviction(58, 0)).toBe("MEDIUM"); // near HIGH boundary
    expect(deriveConviction(58, 1)).toBe("HIGH"); // promoted
  });
  it("bearish analysts demote a borderline-low name", () => {
    expect(deriveConviction(40, 0)).toBe("MEDIUM"); // near LOW boundary
    expect(deriveConviction(40, -1)).toBe("LOW"); // demoted
  });
  it("analysts can't overturn a clearly great or clearly weak backtest", () => {
    expect(deriveConviction(85, -1)).toBe("HIGH"); // not near a boundary
    expect(deriveConviction(15, 1)).toBe("LOW");
  });
  it("no history → MEDIUM default", () => {
    expect(deriveConviction(null, 1)).toBe("MEDIUM");
  });
});

describe("projectTarget", () => {
  it("compounds forward correctly", () => {
    // $100 at 14%/yr for 5yr = 100 * 1.14^5 ≈ 192.54
    expect(projectTarget(100, 14, 5)).toBeCloseTo(192.54, 1);
  });
  it("null on bad input", () => {
    expect(projectTarget(0, 14, 5)).toBeNull();
    expect(projectTarget(100, null, 5)).toBeNull();
    expect(projectTarget(null, 14, 5)).toBeNull();
  });
  it("keeps sub-$10 precision for penny-ish names", () => {
    const t = projectTarget(2, 10, 5)!;
    expect(t).toBeGreaterThan(3.2);
    expect(t).toBeLessThan(3.3);
  });
});

describe("suggestThesis", () => {
  it("great compounder → HIGH conviction with a real multi-year target", () => {
    const s = suggestThesis(
      100,
      stats({ annualizedPct: 30, volatilityPct: 20, maxDrawdownPct: -15, fitScore: 78, years: 3 }),
      cons({ strongBuy: 10, buy: 5, hold: 1 }),
    );
    expect(s.conviction).toBe("HIGH");
    expect(s.horizonYears).toBe(HORIZON_YEARS);
    expect(s.targetPrice).not.toBeNull();
    expect(s.targetMultiple!).toBeGreaterThan(1);
    expect(s.projectedCagrPct).toBeCloseTo(17.5, 1); // 30 capped→25 haircut→17.5
    expect(s.confident).toBe(true);
    expect(s.rationale).toContain("HIGH");
  });

  it("choppy drawdown-scarred name → LOW, still gives a floored target", () => {
    const s = suggestThesis(
      50,
      stats({ annualizedPct: 8, volatilityPct: 90, maxDrawdownPct: -70, fitScore: 12, years: 2 }),
      cons({ hold: 3, sell: 2 }),
    );
    expect(s.conviction).toBe("LOW");
    expect(s.targetPrice).not.toBeNull(); // 8% → haircut 5.6 → target exists
  });

  it("no history → MEDIUM, no target, not confident", () => {
    const s = suggestThesis(
      null,
      stats({ annualizedPct: null, fitScore: null, years: 0, points: 0 }),
      null,
    );
    expect(s.conviction).toBe("MEDIUM");
    expect(s.targetPrice).toBeNull();
    expect(s.confident).toBe(false);
  });

  it("declining history → no upward target even if price is known", () => {
    const s = suggestThesis(
      40,
      stats({ annualizedPct: -12, fitScore: 20, years: 2 }),
      null,
    );
    expect(s.targetPrice).toBeNull();
    expect(s.conviction).toBe("LOW");
  });
});
