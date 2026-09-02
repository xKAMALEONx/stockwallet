import { describe, it, expect } from "vitest";
import { evaluateTrade, type GuardInput } from "./guard";

function base(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    action: "BUY",
    amountUsd: 500,
    price: 100,
    dayChangePct: 0.5,
    week52High: 150, // price well below high
    peTTM: 20,
    portfolioValue: 10000,
    existingPositionValue: 0,
    positionAgeDays: null,
    recentTradeCount6mo: 0,
    hasLongThesis: true,
    ...overrides,
  };
}

function check(r: ReturnType<typeof evaluateTrade>, id: string) {
  return r.checks.find((c) => c.id === id)!;
}

describe("evaluateTrade — long-term guard", () => {
  it("a disciplined buy is GREEN", () => {
    const r = evaluateTrade(base());
    expect(r.verdict).toBe("GREEN");
    expect(r.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("no long thesis warns", () => {
    const r = evaluateTrade(base({ hasLongThesis: false }));
    expect(check(r, "thesis").status).toBe("warn");
    expect(r.verdict).toBe("CAUTION");
  });

  it("buying near the 52-week high is flagged as extended", () => {
    const r = evaluateTrade(base({ price: 148, week52High: 150 }));
    expect(check(r, "extended").status).toBe("warn");
  });

  it("buying up big on the day is flagged as chasing", () => {
    const r = evaluateTrade(base({ dayChangePct: 7 }));
    expect(check(r, "extended").status).toBe("warn");
  });

  it("rich P/E warns", () => {
    const r = evaluateTrade(base({ peTTM: 55 }));
    expect(check(r, "valuation").status).toBe("warn");
  });

  it("over-concentration is a hard block (RED)", () => {
    // existing 2000 + buy 2000 = 4000 of (10000+2000=12000) ~= 33%
    const r = evaluateTrade(
      base({ existingPositionValue: 2000, amountUsd: 2000 }),
    );
    expect(check(r, "concentration").status).toBe("block");
    expect(r.verdict).toBe("RED");
  });

  it("selling a position held < 12 months warns", () => {
    const r = evaluateTrade(base({ action: "SELL", positionAgeDays: 100 }));
    expect(check(r, "hold").status).toBe("warn");
  });

  it("selling into a >10% daily drop warns (panic)", () => {
    const r = evaluateTrade(
      base({ action: "SELL", positionAgeDays: 500, dayChangePct: -12 }),
    );
    expect(check(r, "panic").status).toBe("warn");
  });

  it("a genuine long-term sell with no drop is GREEN", () => {
    const r = evaluateTrade(
      base({ action: "SELL", positionAgeDays: 500, dayChangePct: 1 }),
    );
    expect(r.verdict).toBe("GREEN");
  });

  it("overtrading a name warns", () => {
    const r = evaluateTrade(base({ recentTradeCount6mo: 3 }));
    expect(check(r, "overtrading").status).toBe("warn");
  });
});
