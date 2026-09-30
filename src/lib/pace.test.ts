import { describe, it, expect } from "vitest";
import { gradePace } from "./pace";

const YEAR_MS = 365.25 * 86400000;
// A fixed "now" and a logged date `years` before it.
const NOW = new Date("2026-01-01T00:00:00Z");
const ago = (years: number) => new Date(NOW.getTime() - years * YEAR_MS);

describe("gradePace — money read", () => {
  it("computes live return vs entry regardless of pace inputs", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: null,
      currentPrice: 120,
      horizonYears: null,
      loggedAt: ago(1),
      now: NOW,
    });
    expect(p.returnPct).toBe(20);
    expect(p.grade).toBe("UNKNOWN"); // no target/horizon → can't pace-grade
  });

  it("returns null return when a price is missing", () => {
    const p = gradePace({
      entryPrice: null,
      targetPrice: 200,
      currentPrice: 120,
      horizonYears: 4,
      loggedAt: ago(1),
      now: NOW,
    });
    expect(p.returnPct).toBeNull();
    expect(p.grade).toBe("UNKNOWN");
    expect(p.note).toMatch(/not enough data/i);
  });
});

describe("gradePace — HIT", () => {
  it("flags a bullish pick that reached its target", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: 200,
      currentPrice: 210,
      horizonYears: 4,
      loggedAt: ago(1),
      now: NOW,
      direction: "BULL",
    });
    expect(p.grade).toBe("HIT");
    expect(p.returnPct).toBe(110);
    expect(p.note).toMatch(/target hit/i);
  });

  it("flags a bearish pick that reached a lower target", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: 60,
      currentPrice: 55,
      horizonYears: 4,
      loggedAt: ago(1),
      now: NOW,
      direction: "BEAR",
    });
    expect(p.grade).toBe("HIT");
  });
});

describe("gradePace — pacing (bullish)", () => {
  // entry 100 → target ~194 over 4yr is ~18%/yr. At exactly 1yr in, the
  // compounding path expects 100 * (1.94)^(1/4) ≈ 118.
  const base = {
    entryPrice: 100,
    targetPrice: 194,
    horizonYears: 4,
    loggedAt: ago(1),
    now: NOW,
    direction: "BULL" as const,
  };

  it("on track when price sits near the expected path", () => {
    const p = gradePace({ ...base, currentPrice: 118 });
    expect(p.grade).toBe("ON_TRACK");
    expect(p.expectedPrice).toBeCloseTo(118, 0);
    expect(Math.abs(p.vsExpectedPct!)).toBeLessThanOrEqual(5);
  });

  it("ahead when well above the expected path", () => {
    const p = gradePace({ ...base, currentPrice: 140 });
    expect(p.grade).toBe("AHEAD");
    expect(p.vsExpectedPct!).toBeGreaterThan(5);
  });

  it("behind when well below the expected path", () => {
    const p = gradePace({ ...base, currentPrice: 100 });
    expect(p.grade).toBe("BEHIND");
    expect(p.vsExpectedPct!).toBeLessThan(-5);
  });
});

describe("gradePace — direction awareness", () => {
  // For a bearish pick, being BELOW the expected path is GOOD (ahead of plan).
  it("bearish pick below the path grades AHEAD, not BEHIND", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: 60, // falling toward 60 over 4yr
      currentPrice: 70, // dropped faster than the smooth path at 1yr
      horizonYears: 4,
      loggedAt: ago(1),
      now: NOW,
      direction: "BEAR",
    });
    // Smooth path at 1yr: 100*(0.6)^(1/4) ≈ 88; real 70 is far below → good.
    expect(p.grade).toBe("AHEAD");
  });
});

describe("gradePace — guards", () => {
  it("degrades to UNKNOWN on non-positive horizon", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: 200,
      currentPrice: 120,
      horizonYears: 0,
      loggedAt: ago(1),
      now: NOW,
    });
    expect(p.grade).toBe("UNKNOWN");
  });

  it("clamps elapsed fraction and does not divide by zero at t=0", () => {
    const p = gradePace({
      entryPrice: 100,
      targetPrice: 194,
      currentPrice: 100,
      horizonYears: 4,
      loggedAt: NOW, // logged just now
      now: NOW,
      direction: "BULL",
    });
    // At t=0 the expected price equals entry, so 100 vs 100 → on track.
    expect(p.elapsedFrac).toBe(0);
    expect(p.expectedPrice).toBeCloseTo(100, 0);
    expect(p.grade).toBe("ON_TRACK");
  });
});
