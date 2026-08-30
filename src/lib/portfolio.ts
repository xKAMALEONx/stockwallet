import { Prisma } from "@prisma/client";

// Average-cost basis engine. Positions are always derived from the raw
// transaction ledger — never stored — so the numbers can't drift out of sync.
// All math runs in Decimal (no floating-point money errors).

const Dec = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | string | number;

export type EngineTxn = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: DecimalInput;
  price: DecimalInput;
  fees: DecimalInput;
  tradedAt: Date;
};

export type Position = {
  symbol: string;
  shares: Decimal; // currently held (0 if fully closed)
  avgCost: Decimal; // average cost per held share
  costBasis: Decimal; // shares * avgCost
  realizedPnL: Decimal; // locked-in gain/loss from sells
};

export type PositionWithMarket = Position & {
  price: Decimal | null; // live quote (null if unavailable)
  marketValue: Decimal | null;
  unrealizedPnL: Decimal | null;
};

export type PortfolioSummary = {
  totalCostBasis: Decimal;
  totalRealizedPnL: Decimal;
  totalMarketValue: Decimal | null; // null if any held position is missing a quote
  totalUnrealizedPnL: Decimal | null;
};

/**
 * Reduce a transaction ledger into per-symbol positions using average-cost basis.
 * - BUY: fees increase cost basis.
 * - SELL: fees reduce proceeds; realized P/L = proceeds - (avgCost * qtySold).
 */
export function computePositions(txns: EngineTxn[]): Position[] {
  const bySymbol = new Map<string, EngineTxn[]>();
  for (const t of txns) {
    const key = t.symbol.toUpperCase();
    const arr = bySymbol.get(key) ?? [];
    arr.push(t);
    bySymbol.set(key, arr);
  }

  const positions: Position[] = [];

  for (const [symbol, list] of bySymbol) {
    const sorted = [...list].sort(
      (a, b) => a.tradedAt.getTime() - b.tradedAt.getTime(),
    );

    let shares = new Dec(0);
    let costBasis = new Dec(0);
    let realized = new Dec(0);

    for (const t of sorted) {
      const qty = new Dec(t.quantity);
      const price = new Dec(t.price);
      const fees = new Dec(t.fees ?? 0);

      if (t.side === "BUY") {
        shares = shares.plus(qty);
        costBasis = costBasis.plus(qty.mul(price).plus(fees));
      } else {
        const avg = shares.gt(0) ? costBasis.div(shares) : new Dec(0);
        const proceeds = qty.mul(price).minus(fees);
        const costRemoved = avg.mul(qty);
        realized = realized.plus(proceeds.minus(costRemoved));
        shares = shares.minus(qty);
        costBasis = costBasis.minus(costRemoved);
        // Fully closed (or oversold) → snap to a clean zero.
        if (shares.lte(0)) {
          shares = new Dec(0);
          costBasis = new Dec(0);
        }
      }
    }

    const avgCost = shares.gt(0) ? costBasis.div(shares) : new Dec(0);
    positions.push({ symbol, shares, avgCost, costBasis, realizedPnL: realized });
  }

  positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return positions;
}

/** Attach live quotes to positions (keyed by uppercase symbol). */
export function withQuotes(
  positions: Position[],
  quotes: Record<string, number | undefined>,
): PositionWithMarket[] {
  return positions.map((p) => {
    const q = quotes[p.symbol];
    if (q === undefined || q === null || Number.isNaN(q)) {
      return { ...p, price: null, marketValue: null, unrealizedPnL: null };
    }
    const price = new Dec(q);
    const marketValue = p.shares.mul(price);
    return {
      ...p,
      price,
      marketValue,
      unrealizedPnL: marketValue.minus(p.costBasis),
    };
  });
}

/** Roll positions up into portfolio totals. */
export function summarize(positions: PositionWithMarket[]): PortfolioSummary {
  let totalCostBasis = new Dec(0);
  let totalRealizedPnL = new Dec(0);
  let totalMarketValue: Decimal | null = new Dec(0);

  for (const p of positions) {
    totalCostBasis = totalCostBasis.plus(p.costBasis);
    totalRealizedPnL = totalRealizedPnL.plus(p.realizedPnL);

    // A held position without a quote makes the market total unknowable.
    if (totalMarketValue !== null) {
      if (p.shares.gt(0) && p.marketValue === null) {
        totalMarketValue = null;
      } else if (p.marketValue !== null) {
        totalMarketValue = totalMarketValue.plus(p.marketValue);
      }
    }
  }

  const totalUnrealizedPnL =
    totalMarketValue === null ? null : totalMarketValue.minus(totalCostBasis);

  return {
    totalCostBasis,
    totalRealizedPnL,
    totalMarketValue,
    totalUnrealizedPnL,
  };
}
