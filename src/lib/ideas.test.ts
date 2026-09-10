import { describe, it, expect } from "vitest";
import {
  findGapSectors,
  rankIdeas,
  BROAD_MARKET,
  type Idea,
} from "./ideas";
import type { BacktestStats } from "./backtest";

function stats(fitScore: number | null): BacktestStats {
  return {
    points: 500,
    years: 2,
    totalReturnPct: 20,
    annualizedPct: 10,
    volatilityPct: 15,
    maxDrawdownPct: -20,
    fitScore,
  };
}

function idea(
  symbol: string,
  sector: string,
  kind: "etf" | "stock",
  fitScore: number | null,
): Idea {
  return { symbol, name: symbol, kind, sector, why: "", stats: stats(fitScore) };
}

describe("findGapSectors", () => {
  it("always includes Broad Market as a core suggestion", () => {
    const gaps = findGapSectors(new Set(["Health Care"]), {});
    expect(gaps).toContain(BROAD_MARKET);
  });

  it("flags a sector the user holds none of", () => {
    const gaps = findGapSectors(new Set(["Technology"]), {});
    expect(gaps).toContain("Health Care");
    expect(gaps).toContain("Energy");
  });

  it("flags a sector the user is thin on (below threshold)", () => {
    const gaps = findGapSectors(new Set(["Energy"]), { Energy: 4 }, 10);
    expect(gaps).toContain("Energy"); // 4% < 10% → still a gap
  });

  it("does NOT flag a sector the user already has enough of", () => {
    const gaps = findGapSectors(new Set(["Health Care"]), { "Health Care": 25 }, 10);
    expect(gaps).not.toContain("Health Care");
  });
});

describe("rankIdeas", () => {
  const gap = new Set([BROAD_MARKET, "Health Care"]);

  it("only returns ideas in gap sectors", () => {
    const ranked = rankIdeas(
      [idea("VOO", BROAD_MARKET, "etf", 80), idea("VDE", "Energy", "etf", 90)],
      gap,
      new Set(),
    );
    expect(ranked.map((i) => i.symbol)).toEqual(["VOO"]);
  });

  it("excludes symbols the user already holds", () => {
    const ranked = rankIdeas(
      [idea("VOO", BROAD_MARKET, "etf", 80)],
      gap,
      new Set(["VOO"]),
    );
    expect(ranked).toHaveLength(0);
  });

  it("sorts ETFs ahead of individual stocks", () => {
    const ranked = rankIdeas(
      [
        idea("JNJ", "Health Care", "stock", 99),
        idea("VHT", "Health Care", "etf", 50),
      ],
      gap,
      new Set(),
    );
    expect(ranked[0].symbol).toBe("VHT"); // ETF first even with lower fit
  });

  it("within a kind, higher fit score ranks first", () => {
    const ranked = rankIdeas(
      [
        idea("VHT", "Health Care", "etf", 60),
        idea("VOO", BROAD_MARKET, "etf", 85),
      ],
      gap,
      new Set(),
    );
    expect(ranked[0].symbol).toBe("VOO");
  });

  it("puts null-fit ideas last within their kind", () => {
    const ranked = rankIdeas(
      [
        idea("VHT", "Health Care", "etf", null),
        idea("VOO", BROAD_MARKET, "etf", 40),
      ],
      gap,
      new Set(),
    );
    expect(ranked[0].symbol).toBe("VOO");
  });
});
