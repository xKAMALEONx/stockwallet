import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  buildSectorBreakdown,
  UNKNOWN_SECTOR,
  CRYPTO_SECTOR,
  type SectorHolding,
} from "./sectors";

const Dec = Prisma.Decimal;

function h(symbol: string, sector: string, marketValue: number): SectorHolding {
  return { symbol, sector, marketValue: new Dec(marketValue) };
}

describe("buildSectorBreakdown", () => {
  it("is empty for no holdings", () => {
    const b = buildSectorBreakdown([]);
    expect(b.slices).toHaveLength(0);
    expect(b.total.toNumber()).toBe(0);
    expect(b.topSector).toBeNull();
    expect(b.warnings).toHaveLength(0);
  });

  it("merges holdings in the same sector and sums market value", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 1000),
      h("MSFT", "Technology", 1000),
      h("JPM", "Banking", 500),
    ]);
    const tech = b.slices.find((s) => s.sector === "Technology")!;
    expect(tech.marketValue.toNumber()).toBe(2000);
    expect(tech.symbols).toEqual(["AAPL", "MSFT"]);
  });

  it("computes percentages of total and sorts slices by value desc", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 600),
      h("JPM", "Banking", 400),
    ]);
    expect(b.total.toNumber()).toBe(1000);
    expect(b.slices[0].sector).toBe("Technology");
    expect(b.slices[0].pct).toBeCloseTo(60, 5);
    expect(b.slices[1].pct).toBeCloseTo(40, 5);
    expect(b.topSector!.sector).toBe("Technology");
  });

  it("flags HIGH concentration at >=50% in one sector", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 700),
      h("JPM", "Banking", 300),
    ]);
    const w = b.warnings.find((x) => x.sector === "Technology");
    expect(w?.level).toBe("high");
    expect(w?.pct).toBeCloseTo(70, 5);
  });

  it("flags MODERATE concentration between 35% and 50%", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 400),
      h("JPM", "Banking", 350),
      h("XOM", "Energy", 250),
    ]);
    const w = b.warnings.find((x) => x.sector === "Technology");
    expect(w?.level).toBe("moderate");
  });

  it("does not warn on a well-diversified portfolio", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 300),
      h("JPM", "Banking", 300),
      h("XOM", "Energy", 200),
      h("PG", "Consumer", 200),
    ]);
    expect(b.warnings).toHaveLength(0);
  });

  it("never warns on the Unknown bucket even when it's large", () => {
    const b = buildSectorBreakdown([
      h("WAT", UNKNOWN_SECTOR, 800),
      h("JPM", "Banking", 200),
    ]);
    expect(b.warnings).toHaveLength(0);
    // but it still appears as a slice
    expect(b.slices.find((s) => s.sector === UNKNOWN_SECTOR)).toBeTruthy();
  });

  it("treats crypto as its own sector and can flag it", () => {
    const b = buildSectorBreakdown([
      h("BTC", CRYPTO_SECTOR, 600),
      h("AAPL", "Technology", 400),
    ]);
    const w = b.warnings.find((x) => x.sector === CRYPTO_SECTOR);
    expect(w?.level).toBe("high");
  });

  it("handles decimal market values without float drift", () => {
    const b = buildSectorBreakdown([
      h("AAPL", "Technology", 0.1),
      h("MSFT", "Technology", 0.2),
    ]);
    expect(b.slices[0].marketValue.toNumber()).toBeCloseTo(0.3, 10);
    expect(b.slices[0].pct).toBeCloseTo(100, 5);
  });
});
