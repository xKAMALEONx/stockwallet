// Position sizing for the Bet Journal. The last piece Jaime asked for: turn the
// per-share targets into real money — "if I put in $X at today's price, what
// does that become if the target hits?" Pure arithmetic off the live price and
// whatever target/fair-value/growth numbers are already in the browser, so it
// updates instantly as he types an amount.

export type ProjectedOutcome = {
  label: string; // e.g. "Your target", "Fair value", "5yr growth"
  targetPrice: number; // the per-share price this outcome uses
  projectedValue: number; // stake value if price reaches targetPrice
  profit: number; // projectedValue - amount
  returnPct: number; // profit / amount, percent
};

export type PositionSizing = {
  shares: number | null; // whole-ish shares the amount buys at price
  amount: number | null; // dollars deployed (echoed back, validated)
  outcomes: ProjectedOutcome[]; // one per target we could project to
  note: string;
};

export type SizingTarget = { label: string; price: number | null };

/**
 * Given an `amount` to invest and the live `price`, compute the stake and
 * project it to each supplied target price. Fractional shares are allowed
 * (crypto + most brokers now support them), so we don't force whole shares —
 * but we round the *display* share count for readability while keeping value
 * math exact. Returns nulls / empty when inputs are unusable.
 */
export function sizePosition(
  amount: number | null,
  price: number | null,
  targets: SizingTarget[],
): PositionSizing {
  const valid = (n: number | null): n is number =>
    n != null && Number.isFinite(n) && n > 0;

  if (!valid(amount) || !valid(price)) {
    return {
      shares: null,
      amount: valid(amount) ? amount : null,
      outcomes: [],
      note: "Enter an amount to see the projected value.",
    };
  }

  const shares = amount / price;

  const outcomes: ProjectedOutcome[] = [];
  for (const t of targets) {
    if (!valid(t.price)) continue;
    const projectedValue = shares * t.price;
    const profit = projectedValue - amount;
    outcomes.push({
      label: t.label,
      targetPrice: t.price,
      projectedValue: round2(projectedValue),
      profit: round2(profit),
      returnPct: round1((profit / amount) * 100),
    });
  }

  return {
    shares: round4(shares),
    amount,
    outcomes,
    note: buildNote(amount, shares, price, outcomes),
  };
}

function buildNote(
  amount: number,
  shares: number,
  price: number,
  outcomes: ProjectedOutcome[],
): string {
  const shareTxt =
    shares >= 1
      ? `${round2(shares)} shares`
      : `${round4(shares)} of a share`;
  const head = `$${round2(amount)} buys ~${shareTxt} at $${round2(price)}.`;
  if (outcomes.length === 0) return head + " Set a target to project it forward.";
  return head;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
