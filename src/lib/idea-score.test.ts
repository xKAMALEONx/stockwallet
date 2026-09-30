import { describe, it, expect } from "vitest";
import { scoreIdea, scoreTier, type ScoreInputs } from "./idea-score";

// A deliberately neutral baseline: every signal absent → everything lands near
// the midpoint.
const NEUTRAL: ScoreInputs = {
  newsSentiment: null,
  mentions: 2,
  consensusNet: null,
  consensusDir: 0,
  earningsSurprisePct: null,
  insiderNetValue: null,
  sectorReturnPct: null,
  dayChangePct: null,
  fitScore: null,
};

describe("scoreIdea — baseline", () => {
  it("a signal-less idea scores near the middle, no conflict", () => {
    const r = scoreIdea(NEUTRAL);
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThan(60);
    expect(r.conflict).toBe(false);
    expect(r.conflictNote).toBeNull();
  });

  it("exposes a per-signal breakdown that covers every input", () => {
    const r = scoreIdea(NEUTRAL);
    const labels = r.parts.map((p) => p.label);
    expect(labels).toContain("Analyst consensus");
    expect(labels).toContain("Earnings beat/miss");
    expect(labels).toContain("Insider activity");
    expect(labels).toContain("Sector momentum");
  });
});

describe("scoreIdea — strong all-around idea", () => {
  it("scores high when fresh signals AND history agree", () => {
    const r = scoreIdea({
      newsSentiment: 0.5,
      mentions: 8,
      consensusNet: 30,
      consensusDir: 1,
      earningsSurprisePct: 6,
      insiderNetValue: 500000,
      sectorReturnPct: 12,
      dayChangePct: 2,
      fitScore: 80,
    });
    expect(r.score).toBeGreaterThan(70);
    expect(r.conflict).toBe(false);
    expect(scoreTier(r.score).tone).toBe("pos");
  });
});

describe("scoreIdea — conflict handling (Jaime's rule)", () => {
  it("flags AND down-ranks a hot-news / ugly-history clash", () => {
    const hot = {
      newsSentiment: 0.8,
      mentions: 10,
      consensusNet: 25,
      consensusDir: 1 as const,
      earningsSurprisePct: 8,
      insiderNetValue: 200000,
      sectorReturnPct: 15,
      dayChangePct: 5,
    };
    const withUglyHistory = scoreIdea({ ...hot, fitScore: 10 });
    const withGoodHistory = scoreIdea({ ...hot, fitScore: 85 });

    expect(withUglyHistory.conflict).toBe(true);
    expect(withUglyHistory.conflictNote).toMatch(/rough|higher risk/i);
    // Down-ranked: the clash version must score below the aligned version.
    expect(withUglyHistory.score).toBeLessThan(withGoodHistory.score);
  });

  it("flags the reverse clash: good history but cold current signals", () => {
    const cold = {
      newsSentiment: -0.6,
      mentions: 1,
      consensusNet: -10,
      consensusDir: -1 as const,
      earningsSurprisePct: -5,
      insiderNetValue: -300000,
      sectorReturnPct: -10,
      dayChangePct: -3,
    };
    const r = scoreIdea({ ...cold, fitScore: 88 });
    expect(r.conflict).toBe(true);
    expect(r.conflictNote).toMatch(/out of favor|cool/i);
  });

  it("does NOT flag a conflict when there's no backtest to disagree with", () => {
    const r = scoreIdea({
      ...NEUTRAL,
      newsSentiment: 0.9,
      mentions: 12,
      consensusNet: 40,
      fitScore: null, // no proof side
    });
    expect(r.conflict).toBe(false);
  });
});

describe("scoreIdea — directionality", () => {
  it("earnings beats raise the score vs misses", () => {
    const beat = scoreIdea({ ...NEUTRAL, earningsSurprisePct: 10, fitScore: 50 });
    const miss = scoreIdea({ ...NEUTRAL, earningsSurprisePct: -10, fitScore: 50 });
    expect(beat.score).toBeGreaterThan(miss.score);
  });

  it("insider buying beats insider selling", () => {
    const buying = scoreIdea({ ...NEUTRAL, insiderNetValue: 1_000_000, fitScore: 50 });
    const selling = scoreIdea({ ...NEUTRAL, insiderNetValue: -1_000_000, fitScore: 50 });
    expect(buying.score).toBeGreaterThan(selling.score);
  });

  it("a warming analyst trend beats a cooling one", () => {
    const up = scoreIdea({ ...NEUTRAL, consensusDir: 1, fitScore: 50 });
    const down = scoreIdea({ ...NEUTRAL, consensusDir: -1, fitScore: 50 });
    expect(up.score).toBeGreaterThan(down.score);
  });
});

describe("scoreTier", () => {
  it("labels tiers by cutoff", () => {
    expect(scoreTier(70).label).toBe("Strong fit");
    expect(scoreTier(55).label).toBe("Worth a look");
    expect(scoreTier(30).label).toBe("Weak fit");
  });
});
