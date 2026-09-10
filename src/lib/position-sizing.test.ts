import { describe, it, expect } from "vitest";
import { sizePosition } from "./position-sizing";

describe("sizePosition", () => {
  it("computes shares and projects to each target", () => {
    // $1000 at $100 → 10 shares; target $200 → $2000, +$1000, +100%
    const r = sizePosition(1000, 100, [
      { label: "Your target", price: 200 },
      { label: "Fair value", price: 150 },
    ]);
    expect(r.shares).toBe(10);
    expect(r.outcomes).toHaveLength(2);
    const yt = r.outcomes[0];
    expect(yt.projectedValue).toBe(2000);
    expect(yt.profit).toBe(1000);
    expect(yt.returnPct).toBe(100);
    const fv = r.outcomes[1];
    expect(fv.projectedValue).toBe(1500);
    expect(fv.returnPct).toBe(50);
  });

  it("supports fractional shares for a high-priced name", () => {
    // $500 at $2000 → 0.25 shares; target $3000 → $750
    const r = sizePosition(500, 2000, [{ label: "Your target", price: 3000 }]);
    expect(r.shares).toBe(0.25);
    expect(r.outcomes[0].projectedValue).toBe(750);
    expect(r.note).toContain("of a share");
  });

  it("skips targets that are missing or non-positive", () => {
    const r = sizePosition(1000, 100, [
      { label: "Your target", price: null },
      { label: "Fair value", price: 0 },
      { label: "5yr growth", price: 250 },
    ]);
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0].label).toBe("5yr growth");
  });

  it("handles a losing target (price below entry)", () => {
    const r = sizePosition(1000, 100, [{ label: "Your target", price: 80 }]);
    expect(r.outcomes[0].profit).toBe(-200);
    expect(r.outcomes[0].returnPct).toBe(-20);
  });

  it("degrades gracefully with no amount", () => {
    const r = sizePosition(null, 100, [{ label: "x", price: 200 }]);
    expect(r.shares).toBeNull();
    expect(r.outcomes).toHaveLength(0);
    expect(r.note).toContain("Enter an amount");
  });

  it("degrades gracefully with no price", () => {
    const r = sizePosition(1000, null, [{ label: "x", price: 200 }]);
    expect(r.shares).toBeNull();
    expect(r.amount).toBe(1000);
  });

  it("ignores non-finite / negative inputs", () => {
    expect(sizePosition(-100, 100, []).shares).toBeNull();
    expect(sizePosition(NaN, 100, []).shares).toBeNull();
    expect(sizePosition(1000, -5, []).shares).toBeNull();
  });

  it("notes shares bought even with no targets", () => {
    const r = sizePosition(1000, 100, []);
    expect(r.shares).toBe(10);
    expect(r.note).toContain("Set a target");
  });
});
