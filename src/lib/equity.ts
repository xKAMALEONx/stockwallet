// Equity-curve + benchmark math. Pure & testable: given daily snapshots,
// produce two comparable series indexed to 100 at the first point, so "my
// portfolio" and "just buying SPY" can be read on the same axis.

export type SnapshotPoint = {
  date: string; // YYYY-MM-DD
  marketValue: number;
  costBasis: number;
  dividendsTotal: number;
  spyPrice: number | null;
};

export type CurvePoint = {
  date: string;
  portfolioValue: number; // raw $ (market value + cumulative dividends = total value)
  portfolioIndex: number; // normalized to 100 at start
  spyIndex: number | null; // normalized to 100 at start (null until SPY baseline exists)
};

export type CurveSummary = {
  points: CurvePoint[];
  portfolioReturnPct: number | null; // total-value % change over the window
  spyReturnPct: number | null; // SPY % change over the same window
  outperformancePct: number | null; // portfolio − SPY (positive = beating the index)
};

/**
 * Total portfolio value for a snapshot = market value + cumulative dividends.
 * Dividends are cash you actually received, so total return must include them.
 */
function totalValue(s: SnapshotPoint): number {
  return s.marketValue + s.dividendsTotal;
}

export function buildCurve(snapshots: SnapshotPoint[]): CurveSummary {
  if (snapshots.length === 0) {
    return {
      points: [],
      portfolioReturnPct: null,
      spyReturnPct: null,
      outperformancePct: null,
    };
  }

  const baseVal = totalValue(snapshots[0]);
  // SPY baseline = first day that actually has a SPY price.
  const firstSpy = snapshots.find((s) => s.spyPrice != null)?.spyPrice ?? null;

  const points: CurvePoint[] = snapshots.map((s) => {
    const val = totalValue(s);
    const portfolioIndex = baseVal > 0 ? (val / baseVal) * 100 : 100;
    const spyIndex =
      firstSpy != null && firstSpy > 0 && s.spyPrice != null
        ? (s.spyPrice / firstSpy) * 100
        : null;
    return {
      date: s.date,
      portfolioValue: val,
      portfolioIndex,
      spyIndex,
    };
  });

  const last = points[points.length - 1];
  const portfolioReturnPct = last.portfolioIndex - 100;

  // SPY return over the window uses the last point that has a SPY index.
  const lastSpy = [...points].reverse().find((p) => p.spyIndex != null);
  const spyReturnPct = lastSpy ? lastSpy.spyIndex! - 100 : null;

  const outperformancePct =
    spyReturnPct != null ? portfolioReturnPct - spyReturnPct : null;

  return { points, portfolioReturnPct, spyReturnPct, outperformancePct };
}
