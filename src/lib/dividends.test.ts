import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { incomeBySymbol, totalIncome, totalReturn } from "./dividends";

const Dec = Prisma.Decimal;

describe("incomeBySymbol", () => {
  it("sums dividends per symbol, case-insensitively", () => {
    const map = incomeBySymbol([
      { symbol: "AAPL", amount: 12.5 },
      { symbol: "aapl", amount: 7.5 },
      { symbol: "MSFT", amount: 20 },
    ]);
    expect(map.AAPL.toNumber()).toBe(20);
    expect(map.MSFT.toNumber()).toBe(20);
  });

  it("is empty for no dividends", () => {
    expect(Object.keys(incomeBySymbol([]))).toHaveLength(0);
  });

  it("keeps decimal precision (no float drift)", () => {
    const map = incomeBySymbol([
      { symbol: "KO", amount: "0.1" },
      { symbol: "KO", amount: "0.2" },
    ]);
    expect(map.KO.toString()).toBe("0.3");
  });
});

describe("totalIncome", () => {
  it("sums all dividend income", () => {
    expect(
      totalIncome([{ symbol: "A", amount: 5 }, { symbol: "B", amount: 15 }]).toNumber(),
    ).toBe(20);
  });

  it("is zero for none", () => {
    expect(totalIncome([]).toNumber()).toBe(0);
  });
});

describe("totalReturn", () => {
  it("adds realized + unrealized + income", () => {
    const r = totalReturn(new Dec(100), new Dec(250), new Dec(40));
    expect(r?.toNumber()).toBe(390);
  });

  it("is null when unrealized is unknowable (missing quote)", () => {
    expect(totalReturn(new Dec(100), null, new Dec(40))).toBeNull();
  });

  it("dividends can turn a price loss into a positive total return", () => {
    const r = totalReturn(new Dec(0), new Dec(-30), new Dec(50));
    expect(r?.toNumber()).toBe(20);
  });
});
