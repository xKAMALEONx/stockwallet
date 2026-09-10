import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultAccount, listTransactions } from "@/lib/trades";
import { computePositions, withQuotes } from "@/lib/portfolio";
import { getQuoteData } from "@/lib/quotes";
import { getSectors } from "@/lib/sector-source";
import {
  buildSectorBreakdown,
  UNKNOWN_SECTOR,
  type SectorHolding,
} from "@/lib/sectors";
import {
  getDiversificationIdeas,
  historyEnabled,
} from "@/lib/ideas-source";
import type { Idea } from "@/lib/ideas";
import { addWatch } from "@/app/watchlist-actions";
import { money } from "@/lib/format";

// Weights are positive magnitudes (a 60% sector weight isn't a "+60%" gain),
// so render them plainly rather than with the signed P/L formatter.
const weight = (pct: number) => `${pct.toFixed(1)}%`;

export const dynamic = "force-dynamic";

// A small, stable palette so each sector keeps the same color across bar + legend.
const COLORS = [
  "#34d399", // emerald
  "#38bdf8", // sky
  "#f472b6", // pink
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#fb923c", // orange
  "#22d3ee", // cyan
  "#a3e635", // lime
  "#f87171", // red
  "#94a3b8", // slate (fallback / overflow)
];

export default async function Allocation() {
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getOrCreateDefaultAccount(session.sub);
  const txns = await listTransactions(account.id);
  const positions = computePositions(
    txns.map((t) => ({
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      tradedAt: t.tradedAt,
    })),
  );
  const held = positions.filter((p) => p.shares.gt(0));

  const symbols = held.map((p) => p.symbol);
  const [quoteData, sectorMap] = await Promise.all([
    getQuoteData(symbols),
    getSectors(symbols),
  ]);

  const priceMap: Record<string, number | undefined> = {};
  for (const [sym, q] of Object.entries(quoteData)) priceMap[sym] = q?.price;
  const withMarket = withQuotes(held, priceMap);

  // Only priced holdings can be weighed. Track unpriced ones to report honestly.
  const priced: SectorHolding[] = [];
  const unpriced: string[] = [];
  for (const p of withMarket) {
    if (p.marketValue === null) {
      unpriced.push(p.symbol);
      continue;
    }
    priced.push({
      symbol: p.symbol,
      sector: sectorMap[p.symbol] ?? UNKNOWN_SECTOR,
      marketValue: p.marketValue,
    });
  }

  const breakdown = buildSectorBreakdown(priced);
  const colorFor = (i: number) => COLORS[Math.min(i, COLORS.length - 1)];

  // Diversification ideas: what fills this portfolio's sector gaps. Only when
  // there's an actual portfolio to reason about.
  const heldSectors = new Set(
    breakdown.slices.map((s) => s.sector).filter((s) => s !== UNKNOWN_SECTOR),
  );
  const heldPct: Record<string, number> = {};
  for (const s of breakdown.slices) heldPct[s.sector] = s.pct;
  const heldSymbols = new Set(priced.map((p) => p.symbol.toUpperCase()));

  const ideas: Idea[] =
    breakdown.slices.length > 0
      ? await getDiversificationIdeas({ heldSectors, heldPct, heldSymbols })
      : [];

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Allocation <span className="text-zinc-500">/ sector mix</span>
          </h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        {breakdown.slices.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-5 py-8 text-center text-sm text-zinc-400">
            {held.length === 0 ? (
              <p>No open positions yet. Add some holdings to see your sector mix.</p>
            ) : (
              <p>
                Your holdings don&apos;t have live prices right now, so we
                can&apos;t weigh the sector mix. Check back when quotes are
                available.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Concentration warnings — loud on purpose. */}
            {breakdown.warnings.length > 0 && (
              <section className="flex flex-col gap-2">
                {breakdown.warnings.map((w) => (
                  <div
                    key={w.sector}
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      w.level === "high"
                        ? "border-red-800 bg-red-950/40 text-red-200"
                        : "border-amber-800 bg-amber-950/30 text-amber-200"
                    }`}
                  >
                    <span className="mr-1">
                      {w.level === "high" ? "⚠️" : "👀"}
                    </span>
                    {w.message}
                  </div>
                ))}
              </section>
            )}

            {/* Stacked allocation bar */}
            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex h-6 w-full overflow-hidden rounded-md">
                {breakdown.slices.map((s, i) => (
                  <div
                    key={s.sector}
                    title={`${s.sector} — ${s.pct.toFixed(1)}%`}
                    style={{
                      width: `${s.pct}%`,
                      backgroundColor: colorFor(i),
                    }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Total invested: {money(breakdown.total)} across{" "}
                {breakdown.slices.length} sector
                {breakdown.slices.length === 1 ? "" : "s"}.
              </p>
            </div>

            {/* Breakdown table */}
            <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5">Sector</th>
                    <th className="px-4 py-2.5 text-right">Weight</th>
                    <th className="px-4 py-2.5 text-right">Market Value</th>
                    <th className="px-4 py-2.5">Holdings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {breakdown.slices.map((s, i) => (
                    <tr key={s.sector} className="hover:bg-zinc-900/40">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: colorFor(i) }}
                          />
                          {s.sector}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {weight(s.pct)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {money(s.marketValue)}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">
                        {s.symbols.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unpriced.length > 0 && (
              <p className="text-xs text-zinc-600">
                Not counted (no live price): {unpriced.join(", ")}.
              </p>
            )}

            {/* Diversification ideas — evidence-backed gap-fillers */}
            {ideas.length > 0 && (
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    Ideas to round it out
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Sectors you&apos;re light on, and evidence-backed ways to
                    fill the gap. Ranked by long-term fit — steady compounding
                    over flashy movers. ETFs first (broad, cheap, diversified);
                    a few stocks shown as examples.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {ideas.map((idea) => (
                    <IdeaCard key={idea.symbol} idea={idea} />
                  ))}
                </div>
                {!historyEnabled() && (
                  <p className="text-xs text-zinc-600">
                    Historical fit scores are off (no market-history source
                    configured) — ideas are shown by type only.
                  </p>
                )}
              </section>
            )}

            <p className="text-xs text-zinc-600">
              Diversification is the one free lunch in investing. A heavy tilt
              into one sector means one bad year there hits your whole
              portfolio. Sectors from Finnhub; history from Alpaca. Past
              performance doesn&apos;t predict future returns. Not financial
              advice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const s = idea.stats;
  const fit = s?.fitScore ?? null;

  // Fit-score tint: green = strong long-term profile, amber = middling.
  const fitTone =
    fit == null
      ? "border-zinc-700 text-zinc-400"
      : fit >= 65
        ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
        : fit >= 45
          ? "border-sky-800 bg-sky-950/30 text-sky-300"
          : "border-amber-800 bg-amber-950/30 text-amber-300";

  const stat = (v: number | null, suffix = "%", digits = 1) =>
    v == null ? "—" : `${v.toFixed(digits)}${suffix}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-base font-bold text-emerald-400">
            {idea.symbol}
          </span>
          <span
            className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              idea.kind === "etf"
                ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {idea.kind === "etf" ? "ETF" : "Stock · example"}
          </span>
          <p className="mt-0.5 text-xs text-zinc-400">{idea.name}</p>
        </div>
        {fit != null && (
          <span
            className={`shrink-0 rounded-md border px-2 py-1 text-center text-xs ${fitTone}`}
            title="Long-term fit: risk-adjusted return, penalized for deep drawdowns. Not a prediction."
          >
            <span className="block text-sm font-bold">{fit.toFixed(0)}</span>
            <span className="block text-[9px] uppercase tracking-wide opacity-80">
              fit
            </span>
          </span>
        )}
      </div>

      <p className="text-xs leading-5 text-zinc-300">
        <span className="text-zinc-500">Fills:</span> {idea.sector}. {idea.why}
      </p>

      {s && s.annualizedPct != null && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-zinc-500">
          <span title="Compound annual growth rate over the lookback window">
            CAGR{" "}
            <span className="text-zinc-300">{stat(s.annualizedPct)}</span>
          </span>
          <span title="Annualized volatility — how bumpy the ride was">
            Vol <span className="text-zinc-300">{stat(s.volatilityPct)}</span>
          </span>
          <span title="Worst peak-to-trough decline in the window">
            Max DD{" "}
            <span className="text-zinc-300">{stat(s.maxDrawdownPct)}</span>
          </span>
          <span className="text-zinc-600">{s.years.toFixed(1)}yr history</span>
        </div>
      )}

      <form action={addWatch} className="mt-1">
        <input type="hidden" name="symbol" value={idea.symbol} />
        <button className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40">
          + Watch
        </button>
      </form>
    </div>
  );
}
