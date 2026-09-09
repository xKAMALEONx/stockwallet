import { Prisma } from "@prisma/client";

// Dividend income summarization. Kept separate from the cost-basis engine:
// dividends don't change shares or basis, they're realized cash income that
// makes up the "income" half of TOTAL RETURN (price gains + income).
// All math runs in Decimal (no floating-point money errors).

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | string | number;

export type DividendInput = {
  symbol: string;
  amount: DecimalInput;
};

/** Total dividend income per symbol (uppercase keyed). */
export function incomeBySymbol(dividends: DividendInput[]): Record<string, Decimal> {
  const map: Record<string, Decimal> = {};
  for (const d of dividends) {
    const key = d.symbol.toUpperCase();
    const prev = map[key] ?? new Dec(0);
    map[key] = prev.plus(new Dec(d.amount));
  }
  return map;
}

/** Grand total of all dividend income. */
export function totalIncome(dividends: DividendInput[]): Decimal {
  return dividends.reduce((sum, d) => sum.plus(new Dec(d.amount)), new Dec(0));
}

/**
 * Total return = price P/L (realized + unrealized) + dividend income.
 * Any null (missing quote making unrealized unknowable) makes the total null.
 */
export function totalReturn(
  realizedPnL: Decimal,
  unrealizedPnL: Decimal | null,
  dividendIncome: Decimal,
): Decimal | null {
  if (unrealizedPnL === null) return null;
  return realizedPnL.plus(unrealizedPnL).plus(dividendIncome);
}
