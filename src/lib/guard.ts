// Trade Guard — a long-term-investing rules engine. Pure function so it can be
// unit-tested; the page gathers the data and calls evaluateTrade().

export type TradeAction = "BUY" | "SELL";
export type CheckStatus = "ok" | "warn" | "block";

export type GuardInput = {
  action: TradeAction;
  amountUsd: number; // intended trade size in $
  price: number | null;
  dayChangePct: number | null;
  week52High: number | null;
  peTTM: number | null;
  portfolioValue: number; // current total market value of holdings
  existingPositionValue: number; // current market value of this ticker held
  positionAgeDays: number | null; // days since earliest buy (null if not held)
  recentTradeCount6mo: number; // prior trades on this ticker in last 6 months
  hasLongThesis: boolean; // open journal thesis for ticker w/ >=12mo horizon
  isCrypto?: boolean; // crypto has no earnings → P/E doesn't apply
};

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
};

export type GuardResult = {
  verdict: "GREEN" | "CAUTION" | "RED";
  checks: Check[];
};

// Long-term thresholds (Jaime's settings).
export const GUARD = {
  HORIZON_MONTHS: 12,
  NEAR_HIGH_PCT: 5, // within 5% of 52-wk high = "extended"
  CHASE_DAY_PCT: 5, // up >5% today = "chasing"
  PE_CEILING: 40,
  CONCENTRATION_CAP_PCT: 25,
  PANIC_DROP_PCT: 10, // down >10% today = "panic sell"
  OVERTRADE_COUNT: 3, // 3+ trades in 6 months
  OVERTRADE_MONTHS: 6,
  MIN_HOLD_DAYS: 365, // 12 months
} as const;

export function evaluateTrade(input: GuardInput): GuardResult {
  const checks: Check[] = [];

  if (input.action === "BUY") {
    // 1. Thesis + horizon
    checks.push({
      id: "thesis",
      label: "Thesis + 12-month horizon",
      status: input.hasLongThesis ? "ok" : "warn",
      message: input.hasLongThesis
        ? "You have a long-term thesis logged for this."
        : "No 12-month thesis logged yet — write down why before you buy.",
    });

    // 2. Don't buy extended
    let extended = false;
    const reasons: string[] = [];
    if (
      input.price != null &&
      input.week52High != null &&
      input.week52High > 0 &&
      input.price >= input.week52High * (1 - GUARD.NEAR_HIGH_PCT / 100)
    ) {
      extended = true;
      reasons.push(`within ${GUARD.NEAR_HIGH_PCT}% of its 52-week high`);
    }
    if (input.dayChangePct != null && input.dayChangePct > GUARD.CHASE_DAY_PCT) {
      extended = true;
      reasons.push(`up ${input.dayChangePct.toFixed(1)}% today`);
    }
    checks.push({
      id: "extended",
      label: "Don't buy extended",
      status: extended ? "warn" : "ok",
      message: extended
        ? `It's ${reasons.join(" and ")} — consider averaging in instead of paying up.`
        : "Not chasing an extended price.",
    });

    // 3. Valuation (P/E)
    checks.push({
      id: "valuation",
      label: "Valuation (P/E)",
      status:
        !input.isCrypto && input.peTTM != null && input.peTTM > GUARD.PE_CEILING
          ? "warn"
          : "ok",
      message: input.isCrypto
        ? "P/E doesn't apply to crypto — a coin has no company earnings to price."
        : input.peTTM == null
          ? "No P/E available (may be unprofitable or missing data)."
          : input.peTTM > GUARD.PE_CEILING
            ? `P/E is ${input.peTTM.toFixed(0)} (> ${GUARD.PE_CEILING}) — you're paying a premium for future growth.`
            : `P/E is ${input.peTTM.toFixed(0)} — reasonable.`,
    });

    // 4. Concentration (block)
    const projected =
      input.portfolioValue + input.amountUsd > 0
        ? ((input.existingPositionValue + input.amountUsd) /
            (input.portfolioValue + input.amountUsd)) *
          100
        : 0;
    checks.push({
      id: "concentration",
      label: "Concentration cap",
      status: projected > GUARD.CONCENTRATION_CAP_PCT ? "block" : "ok",
      message:
        projected > GUARD.CONCENTRATION_CAP_PCT
          ? `This would make the ticker ~${projected.toFixed(0)}% of your portfolio (cap ${GUARD.CONCENTRATION_CAP_PCT}%). One bad call shouldn't sink you.`
          : `Position would be ~${projected.toFixed(0)}% of your portfolio — within limit.`,
    });
  } else {
    // SELL — 5. Hold, don't churn
    checks.push({
      id: "hold",
      label: "Hold, don't churn",
      status:
        input.positionAgeDays != null &&
        input.positionAgeDays < GUARD.MIN_HOLD_DAYS
          ? "warn"
          : "ok",
      message:
        input.positionAgeDays == null
          ? "No open position found for this ticker."
          : input.positionAgeDays < GUARD.MIN_HOLD_DAYS
            ? `You've held this only ${input.positionAgeDays} days (< 12 months). Has the thesis actually changed?`
            : `Held ${input.positionAgeDays} days — a real long-term hold.`,
    });

    // 6. Don't panic-sell
    checks.push({
      id: "panic",
      label: "Don't panic-sell",
      status:
        input.dayChangePct != null &&
        input.dayChangePct <= -GUARD.PANIC_DROP_PCT
          ? "warn"
          : "ok",
      message:
        input.dayChangePct != null && input.dayChangePct <= -GUARD.PANIC_DROP_PCT
          ? `It's down ${Math.abs(input.dayChangePct).toFixed(1)}% today — selling into weakness is how long-term returns get wrecked. Thesis-driven or emotional?`
          : "Not selling into a sharp drop.",
    });
  }

  // 7. Overtrading (both actions)
  const priorForThird = GUARD.OVERTRADE_COUNT - 1;
  checks.push({
    id: "overtrading",
    label: "Overtrading",
    status: input.recentTradeCount6mo >= priorForThird ? "warn" : "ok",
    message:
      input.recentTradeCount6mo >= priorForThird
        ? `This would be your ${input.recentTradeCount6mo + 1}th trade on this ticker in ${GUARD.OVERTRADE_MONTHS} months — you should be holding it, not trading around it.`
        : "Not overtrading this name.",
  });

  const hasBlock = checks.some((c) => c.status === "block");
  const hasWarn = checks.some((c) => c.status === "warn");
  const verdict = hasBlock ? "RED" : hasWarn ? "CAUTION" : "GREEN";
  return { verdict, checks };
}
