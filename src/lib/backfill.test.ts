import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  eachDay,
  positionsAsOf,
  dividendsAsOf,
  reconstructRow,
  reconstructCurve,
  fillForward,
  type CloseTable,
  type DatedDividend,
} from "./backfill";
import type { EngineTxn } from "./portfolio";

const Dec = Prisma.Decimal;

function buy(symbol: string, qty: number, price: number, at: string): EngineTxn {
  return { symbol, side: "BUY", quantity: qty, price, fees: 0, tradedAt: new Date(at) };
}
function sell(symbol: string, qty: number, price: number, at: string): EngineTxn {
  return { symbol, side: "SELL", quantity: qty, price, fees: 0, tradedAt: new Date(at) };
}

describe("eachDay", () => {
  it("is inclusive of both ends", () => {
    const days = eachDay(new Date("2025-01-01"), new Date("2025-01-03"));
    expect(days).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
  });
  it("returns a single day when start === end", () => {
    expect(eachDay(new Date("2025-06-15"), new Date("2025-06-15"))).toEqual([
      "2025-06-15",
    ]);
  });
});

describe("positionsAsOf", () => {
  const txns = [
    buy("XRP", 100, 0.5, "2025-04-09T00:00:00Z"),
    buy("NVDA", 10, 100, "2025-08-04T00:00:00Z"),
    sell("XRP", 40, 0.6, "2025-09-01T00:00:00Z"),
  ];

  it("only counts trades on or before the date", () => {
    const { shares } = positionsAsOf(txns, "2025-04-09");
    expect(shares.get("XRP")?.toString()).toBe("100");
    expect(shares.has("NVDA")).toBe(false);
  });

  it("reflects later buys", () => {
    const { shares } = positionsAsOf(txns, "2025-08-10");
    expect(shares.get("XRP")?.toString()).toBe("100");
    expect(shares.get("NVDA")?.toString()).toBe("10");
  });

  it("reflects partial sells", () => {
    const { shares } = positionsAsOf(txns, "2025-09-02");
    expect(shares.get("XRP")?.toString()).toBe("60");
  });

  it("drops fully-closed positions", () => {
    const closed = [
      buy("DOGE", 1000, 0.1, "2025-05-01T00:00:00Z"),
      sell("DOGE", 1000, 0.2, "2025-06-01T00:00:00Z"),
    ];
    const { shares } = positionsAsOf(closed, "2025-07-01");
    expect(shares.has("DOGE")).toBe(false);
  });

  it("tracks cost basis excluding closed lots", () => {
    const { costBasis } = positionsAsOf(txns, "2025-08-10");
    // XRP: 100 * 0.5 = 50; NVDA: 10 * 100 = 1000 → 1050
    expect(costBasis.toNumber()).toBeCloseTo(1050, 6);
  });
});

describe("dividendsAsOf", () => {
  const divs: DatedDividend[] = [
    { symbol: "NVDA", amount: 5, paidAt: new Date("2025-08-15T00:00:00Z") },
    { symbol: "NVDA", amount: 5, paidAt: new Date("2025-11-15T00:00:00Z") },
  ];
  it("accumulates only paid dividends", () => {
    expect(dividendsAsOf(divs, "2025-08-16").toNumber()).toBe(5);
    expect(dividendsAsOf(divs, "2025-12-01").toNumber()).toBe(10);
    expect(dividendsAsOf(divs, "2025-01-01").toNumber()).toBe(0);
  });
});

describe("reconstructRow", () => {
  const txns = [buy("XRP", 100, 0.5, "2025-04-09T00:00:00Z")];
  const closes: CloseTable = {
    XRP: { "2025-04-10": 0.55 },
    SPY: { "2025-04-10": 500 },
  };

  it("values held shares at that day's close", () => {
    const row = reconstructRow("2025-04-10", txns, [], closes)!;
    expect(row.marketValue.toNumber()).toBeCloseTo(55, 6); // 100 * 0.55
    expect(row.spyPrice).toBe(500);
    expect(row.missing).toEqual([]);
  });

  it("returns null when nothing is held", () => {
    expect(reconstructRow("2025-01-01", txns, [], closes)).toBeNull();
  });

  it("flags symbols missing a close for that day", () => {
    const row = reconstructRow("2025-04-11", txns, [], closes)!;
    expect(row.missing).toEqual(["XRP"]);
  });
});

describe("reconstructCurve", () => {
  it("drops days with any missing close, keeps complete ones", () => {
    const txns = [buy("XRP", 100, 0.5, "2025-04-09T00:00:00Z")];
    const closes: CloseTable = {
      XRP: { "2025-04-09": 0.5, "2025-04-11": 0.6 },
      SPY: { "2025-04-09": 500, "2025-04-11": 505 },
    };
    const rows = reconstructCurve(
      new Date("2025-04-09"),
      new Date("2025-04-11"),
      txns,
      [],
      closes,
    );
    // 04-10 dropped (no XRP close); 09 and 11 kept.
    expect(rows.map((r) => r.date)).toEqual(["2025-04-09", "2025-04-11"]);
  });
});

describe("fillForward", () => {
  it("carries the last close across gaps (weekends)", () => {
    const closes: CloseTable = { XRP: { "2025-04-11": 0.6 } }; // Friday only
    const filled = fillForward(
      closes,
      new Date("2025-04-11"),
      new Date("2025-04-13"),
    );
    expect(filled.XRP["2025-04-11"]).toBe(0.6);
    expect(filled.XRP["2025-04-12"]).toBe(0.6); // Sat inherits Fri
    expect(filled.XRP["2025-04-13"]).toBe(0.6); // Sun inherits Fri
  });

  it("does not backfill before the first known close", () => {
    const closes: CloseTable = { XRP: { "2025-04-12": 0.6 } };
    const filled = fillForward(
      closes,
      new Date("2025-04-11"),
      new Date("2025-04-12"),
    );
    expect(filled.XRP["2025-04-11"]).toBeUndefined();
    expect(filled.XRP["2025-04-12"]).toBe(0.6);
  });
});
