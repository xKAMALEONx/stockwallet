import { describe, it, expect } from "vitest";
import { targetImplications } from "./target-math";

describe("targetImplications", () => {
  it("computes multiple, total and implied CAGR for a doubling over 5yr", () => {
    const r = targetImplications(200, 100, 5, 150);
    expect(r.multiple).toBe(2);
    expect(r.totalReturnPct).toBe(100);
    // 2^(1/5) - 1 ≈ 14.87%
    expect(r.impliedCagrPct).toBeCloseTo(14.9, 1);
  });

  it("computes target vs fair value gap", () => {
    // target 200 vs fair 150 → +33.3%
    const r = targetImplications(200, 100, 5, 150);
    expect(r.vsFairValuePct).toBeCloseTo(33.3, 1);
    expect(r.note).toContain("above fair value");
  });

  it("flags an aggressive required pace", () => {
    // 4× over 5yr → ~32%/yr
    const r = targetImplications(400, 100, 5, null);
    expect(r.impliedCagrPct!).toBeGreaterThanOrEqual(30);
    expect(r.note).toContain("aggressive");
  });

  it("notes a conservative target below fair value", () => {
    const r = targetImplications(120, 100, 5, 160);
    expect(r.vsFairValuePct!).toBeLessThan(-15);
    expect(r.note).toContain("below fair value");
  });

  it("handles a target at/under the current price", () => {
    const r = targetImplications(100, 100, 5, 100);
    expect(r.multiple).toBe(1);
    expect(r.totalReturnPct).toBe(0);
    expect(r.impliedCagrPct).toBe(0);
    expect(r.note).toContain("at or below");
  });

  it("degrades gracefully when target or price missing", () => {
    expect(targetImplications(null, 100, 5, 150).multiple).toBeNull();
    expect(targetImplications(200, null, 5, 150).impliedCagrPct).toBeNull();
    const r = targetImplications(null, null, 5, null);
    expect(r.note).toContain("Enter a target");
  });

  it("omits fair-value gap when no fair value is known", () => {
    const r = targetImplications(200, 100, 5, null);
    expect(r.vsFairValuePct).toBeNull();
    expect(r.note).not.toContain("fair value");
  });

  it("ignores non-positive / non-finite inputs", () => {
    expect(targetImplications(-5, 100, 5, 150).multiple).toBeNull();
    expect(targetImplications(200, 0, 5, 150).multiple).toBeNull();
    expect(targetImplications(NaN, 100, 5, 150).multiple).toBeNull();
  });
});
