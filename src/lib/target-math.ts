// Live implications of a user-chosen target price. When Jaime overrides the
// auto-suggested target with his own number ("what I could afford / what I'm
// comfortable with"), the panel shouldn't go stale — it should recompute what
// THAT target implies. All pure arithmetic from numbers already in the browser
// (typed target, live price, fair value), so it updates instantly as he types.

export type TargetImplications = {
  /** target / price — how many times the current price. */
  multiple: number | null;
  /** Annualized return needed to reach the target over the horizon (percent). */
  impliedCagrPct: number | null;
  /** Total return from price to target (percent). */
  totalReturnPct: number | null;
  /** target vs fair value (percent). +ve = target sits above fair value. */
  vsFairValuePct: number | null;
  /** A short, honest read on how ambitious/conservative the target is. */
  note: string;
};

/**
 * Compute what a chosen `target` implies given the live `price`, a projection
 * `horizonYears`, and (optionally) the earnings-based `fairValue`. Returns nulls
 * where inputs are missing so the UI degrades gracefully.
 */
export function targetImplications(
  target: number | null,
  price: number | null,
  horizonYears: number,
  fairValue: number | null,
): TargetImplications {
  const valid = (n: number | null): n is number =>
    n != null && Number.isFinite(n) && n > 0;

  if (!valid(target) || !valid(price)) {
    return {
      multiple: null,
      impliedCagrPct: null,
      totalReturnPct: null,
      vsFairValuePct: null,
      note: "Enter a target to see what it implies.",
    };
  }

  const multiple = round2(target / price);
  const totalReturnPct = round1((target / price - 1) * 100);
  const impliedCagrPct =
    horizonYears > 0
      ? round1((Math.pow(target / price, 1 / horizonYears) - 1) * 100)
      : null;
  const vsFairValuePct = valid(fairValue)
    ? round1(((target - fairValue) / fairValue) * 100)
    : null;

  return {
    multiple,
    impliedCagrPct,
    totalReturnPct,
    vsFairValuePct,
    note: buildNote(multiple, impliedCagrPct, vsFairValuePct, horizonYears),
  };
}

// Honest, non-hyping read. Calls out targets that need a heroic growth rate or
// that sit well above what the fundamentals justify — the anti-guessing spirit.
function buildNote(
  multiple: number,
  impliedCagrPct: number | null,
  vsFairValuePct: number | null,
  horizonYears: number,
): string {
  const parts: string[] = [];

  if (impliedCagrPct != null) {
    parts.push(
      `needs ~${impliedCagrPct.toFixed(0)}%/yr for ${horizonYears}yr (${multiple}× the price)`,
    );
  } else {
    parts.push(`${multiple}× the current price`);
  }

  // Ambition flag off the required annual return.
  if (impliedCagrPct != null) {
    if (impliedCagrPct >= 30) {
      parts.push("that's an aggressive pace — few names sustain it");
    } else if (impliedCagrPct <= 0) {
      parts.push("that's at or below today's price");
    }
  }

  // Fair-value context.
  if (vsFairValuePct != null) {
    if (vsFairValuePct > 15) {
      parts.push(`and sits ~${vsFairValuePct.toFixed(0)}% above fair value`);
    } else if (vsFairValuePct < -15) {
      parts.push(`and is ~${Math.abs(vsFairValuePct).toFixed(0)}% below fair value (conservative)`);
    } else {
      parts.push("roughly in line with fair value");
    }
  }

  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
