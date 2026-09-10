import { describe, it, expect } from "vitest";
import { fairValue, justifiedPE, type FairValueInputs } from "./fair-value";

const base = (o: Partial<FairValueInputs>): FairValueInputs => ({
  price: 100,
  epsTTM: 5,
  forwardPE: 25,
  peTTM: 25,
  epsGrowth5Y: 15,
  epsGrowth3Y: 15,
  week52High: 120,
  week52Low: 70,
  ...o,
});

describe("justifiedPE", () => {
  it("uses growth × PEG anchor, capped by the market's own P/E", () => {
    // growth 15 → growthPE 30; market P/E 25 → min = 25
    expect(justifiedPE(25, 25, 15)).toBe(25);
  });
  it("uses growth-implied when it's below market P/E", () => {
    // growth 8 → growthPE 16; market 25 → min = 16
    expect(justifiedPE(25, 25, 8)).toBe(16);
  });
  it("caps runaway growth multiples at PE_CAP", () => {
    // growth 50 → capped to 30 → 60 growthPE; but market 80 → min 60; cap 40
    expect(justifiedPE(80, 80, 50)).toBe(40);
  });
  it("floors low multiples", () => {
    // growth 2 → growthPE 4; floored to 8
    expect(justifiedPE(5, 5, 2)).toBe(8);
  });
  it("falls back to market P/E blend when growth unusable", () => {
    // no growth → avg(20,30)=25
    expect(justifiedPE(20, 30, null)).toBe(25);
  });
  it("null when nothing usable", () => {
    expect(justifiedPE(null, null, null)).toBeNull();
  });
});

describe("fairValue — earnings method", () => {
  it("fairly-priced stock lands in the FAIR band", () => {
    // eps 5 × jpe 25 = 125 vs price 125 → 0% gap → FAIR
    const r = fairValue(base({ price: 125, epsTTM: 5, peTTM: 25, forwardPE: 25, epsGrowth5Y: 15, epsGrowth3Y: 15 }));
    expect(r.method).toBe("earnings");
    expect(r.fairValue).toBe(125);
    expect(r.verdict).toBe("FAIR");
  });

  it("flags a clearly undervalued name", () => {
    // fair 125, price 90 → ~39% below price → UNDERVALUED
    const r = fairValue(base({ price: 90, peTTM: 25, forwardPE: 25, epsGrowth5Y: 15, epsGrowth3Y: 15 }));
    expect(r.verdict).toBe("UNDERVALUED");
    expect(r.discountPct!).toBeGreaterThan(10);
  });

  it("flags a clearly overvalued name", () => {
    // fair 125, price 200 → negative gap → OVERVALUED
    const r = fairValue(base({ price: 200, peTTM: 25, forwardPE: 25, epsGrowth5Y: 15, epsGrowth3Y: 15 }));
    expect(r.verdict).toBe("OVERVALUED");
    expect(r.discountPct!).toBeLessThan(-10);
  });

  it("shows the math it used", () => {
    const r = fairValue(base({ price: 125 }));
    expect(r.justifiedPE).not.toBeNull();
    expect(r.epsUsed).toBe(5);
    expect(r.growthUsed).toBe(15);
    expect(r.rationale).toContain("Fair value");
    expect(r.rationale).toContain("P/E");
  });
});

describe("fairValue — fallback + edges", () => {
  it("unprofitable company falls back to 52-week midpoint, labeled weaker", () => {
    const r = fairValue(base({ epsTTM: -2, week52High: 120, week52Low: 80, price: 100 }));
    expect(r.method).toBe("range");
    expect(r.fairValue).toBe(100); // midpoint of 80–120
    expect(r.rationale).toContain("weaker");
  });

  it("no earnings and no range → UNKNOWN", () => {
    const r = fairValue(base({ epsTTM: null, week52High: null, week52Low: null }));
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.fairValue).toBeNull();
    expect(r.method).toBe("none");
  });

  it("handles a missing price (no verdict, still gives fair value)", () => {
    const r = fairValue(base({ price: null }));
    expect(r.fairValue).not.toBeNull();
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.discountPct).toBeNull();
  });
});
