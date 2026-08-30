import { describe, it, expect } from "vitest";
import {
  computePositions,
  withQuotes,
  summarize,
  type EngineTxn,
} from "./portfolio";

function tx(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  fees: number,
  day: string,
): EngineTxn {
  return { symbol, side, quantity, price, fees, tradedAt: new Date(day) };
}

describe("computePositions — average cost basis", () => {
  it("a single buy", () => {
    const [p] = computePositions([tx("AAPL", "BUY", 10, 100, 0, "2026-01-01")]);
    expect(p.symbol).toBe("AAPL");
    expect(p.shares.toNumber()).toBe(10);
    expect(p.avgCost.toNumber()).toBe(100);
    expect(p.costBasis.toNumber()).toBe(1000);
    expect(p.realizedPnL.toNumber()).toBe(0);
  });

  it("averages the cost across two buys", () => {
    const [p] = computePositions([
      tx("AAPL", "BUY", 10, 100, 0, "2026-01-01"),
      tx("AAPL", "BUY", 10, 120, 0, "2026-01-02"),
    ]);
    expect(p.shares.toNumber()).toBe(20);
    expect(p.avgCost.toNumber()).toBe(110);
    expect(p.costBasis.toNumber()).toBe(2200);
  });

  it("realizes P/L on a partial sell at average cost", () => {
    const [p] = computePositions([
      tx("AAPL", "BUY", 10, 100, 0, "2026-01-01"),
      tx("AAPL", "BUY", 10, 120, 0, "2026-01-02"),
      tx("AAPL", "SELL", 5, 130, 0, "2026-01-03"),
    ]);
    // avg 110, sell 5 @130 → realized (130-110)*5 = 100
    expect(p.realizedPnL.toNumber()).toBe(100);
    expect(p.shares.toNumber()).toBe(15);
    expect(p.avgCost.toNumber()).toBe(110);
    expect(p.costBasis.toNumber()).toBe(1650);
  });

  it("folds fees into basis (buy) and proceeds (sell)", () => {
    const [p] = computePositions([
      tx("MSFT", "BUY", 1, 100, 1, "2026-01-01"), // basis 101
      tx("MSFT", "SELL", 1, 100, 1, "2026-01-02"), // proceeds 99, cost 101 → -2
    ]);
    expect(p.shares.toNumber()).toBe(0);
    expect(p.costBasis.toNumber()).toBe(0);
    expect(p.realizedPnL.toNumber()).toBe(-2);
  });

  it("snaps to zero when a position is fully closed", () => {
    const [p] = computePositions([
      tx("TSLA", "BUY", 3, 200, 0, "2026-01-01"),
      tx("TSLA", "SELL", 3, 250, 0, "2026-01-02"),
    ]);
    expect(p.shares.toNumber()).toBe(0);
    expect(p.costBasis.toNumber()).toBe(0);
    expect(p.realizedPnL.toNumber()).toBe(150); // (250-200)*3
  });

  it("sorts by trade date regardless of input order", () => {
    const [p] = computePositions([
      tx("NVDA", "SELL", 5, 130, 0, "2026-01-03"),
      tx("NVDA", "BUY", 10, 100, 0, "2026-01-01"),
      tx("NVDA", "BUY", 10, 120, 0, "2026-01-02"),
    ]);
    // Must process buys first → avg 110, realized (130-110)*5 = 100
    expect(p.realizedPnL.toNumber()).toBe(100);
    expect(p.shares.toNumber()).toBe(15);
  });

  it("handles fractional shares without float drift", () => {
    const [p] = computePositions([
      tx("AAPL", "BUY", 0.1, 100, 0, "2026-01-01"),
      tx("AAPL", "BUY", 0.2, 100, 0, "2026-01-02"),
    ]);
    expect(p.shares.toString()).toBe("0.3");
    expect(p.costBasis.toNumber()).toBe(30);
  });
});

describe("withQuotes + summarize", () => {
  it("computes market value and unrealized P/L", () => {
    const positions = computePositions([
      tx("AAPL", "BUY", 10, 100, 0, "2026-01-01"),
    ]);
    const [wm] = withQuotes(positions, { AAPL: 150 });
    expect(wm.marketValue?.toNumber()).toBe(1500);
    expect(wm.unrealizedPnL?.toNumber()).toBe(500);
  });

  it("marks market value unknown when a held position lacks a quote", () => {
    const positions = computePositions([
      tx("AAPL", "BUY", 10, 100, 0, "2026-01-01"),
    ]);
    const wm = withQuotes(positions, {});
    const s = summarize(wm);
    expect(s.totalCostBasis.toNumber()).toBe(1000);
    expect(s.totalMarketValue).toBeNull();
    expect(s.totalUnrealizedPnL).toBeNull();
  });

  it("totals across multiple quoted positions", () => {
    const positions = computePositions([
      tx("AAPL", "BUY", 10, 100, 0, "2026-01-01"),
      tx("MSFT", "BUY", 5, 200, 0, "2026-01-01"),
    ]);
    const wm = withQuotes(positions, { AAPL: 150, MSFT: 220 });
    const s = summarize(wm);
    expect(s.totalCostBasis.toNumber()).toBe(2000); // 1000 + 1000
    expect(s.totalMarketValue?.toNumber()).toBe(2600); // 1500 + 1100
    expect(s.totalUnrealizedPnL?.toNumber()).toBe(600);
  });
});
