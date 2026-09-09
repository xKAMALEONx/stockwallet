import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listSnapshots } from "@/lib/snapshots";
import { buildCurve, type SnapshotPoint } from "@/lib/equity";
import { money, percent, pnlColor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Performance() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await listSnapshots(session.sub);
  const snapshots: SnapshotPoint[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    marketValue: r.marketValue.toNumber(),
    costBasis: r.costBasis.toNumber(),
    dividendsTotal: r.dividendsTotal.toNumber(),
    spyPrice: r.spyPrice ? r.spyPrice.toNumber() : null,
  }));

  const curve = buildCurve(snapshots);

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Performance <span className="text-zinc-500">/ equity curve</span>
          </h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        {snapshots.length < 2 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-5 py-8 text-center text-sm text-zinc-400">
            <p className="mb-2 text-zinc-300">Collecting your history…</p>
            <p>
              A daily snapshot of your portfolio value and the S&amp;P 500 is
              recorded each weekday. Your equity curve appears once there are at
              least two days of history — check back tomorrow.
            </p>
            {snapshots.length === 1 && (
              <p className="mt-3 text-xs text-zinc-600">
                1 snapshot so far ({snapshots[0].date}).
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Tile
                label="Your Return"
                value={percent(curve.portfolioReturnPct)}
                color={pnlColor(curve.portfolioReturnPct)}
                hint="Total value incl. dividends"
              />
              <Tile
                label="S&P 500 (SPY)"
                value={percent(curve.spyReturnPct)}
                color={pnlColor(curve.spyReturnPct)}
                hint="Same window"
              />
              <Tile
                label="vs. Index"
                value={percent(curve.outperformancePct)}
                color={pnlColor(curve.outperformancePct)}
                hint={
                  curve.outperformancePct == null
                    ? undefined
                    : curve.outperformancePct >= 0
                      ? "You're beating SPY 🐼"
                      : "SPY is ahead"
                }
              />
            </section>

            <EquityChart curve={curve} />

            <p className="text-xs text-zinc-600">
              Both lines start at 100 on your first snapshot day, so they&apos;re
              directly comparable — this shows whether your picks are beating just
              buying the index. Not financial advice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EquityChart({ curve }: { curve: ReturnType<typeof buildCurve> }) {
  const pts = curve.points;
  const W = 900;
  const H = 320;
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const indices = pts.flatMap((p) =>
    p.spyIndex != null ? [p.portfolioIndex, p.spyIndex] : [p.portfolioIndex],
  );
  const min = Math.min(100, ...indices);
  const max = Math.max(100, ...indices);
  const range = max - min || 1;
  const pad = range * 0.08;
  const yMin = min - pad;
  const yMax = max + pad;

  const x = (i: number) =>
    PAD.left + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const y = (v: number) =>
    PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const line = (key: "portfolioIndex" | "spyIndex") => {
    const seg: string[] = [];
    pts.forEach((p, i) => {
      const v = p[key];
      if (v == null) return;
      seg.push(`${seg.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    });
    return seg.join(" ");
  };

  // Baseline (100) gridline + a couple of value gridlines.
  const gridVals = [yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v));
  const uniqueGrid = [...new Set([100, ...gridVals])].filter(
    (v) => v >= yMin && v <= yMax,
  );

  const firstDate = pts[0].date;
  const lastDate = pts[pts.length - 1].date;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center gap-5 text-xs">
        <LegendLine color="#34d399" label="You" />
        <LegendLine color="#38bdf8" label="S&P 500" dashed />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Equity curve: your portfolio vs the S&P 500, indexed to 100">
        {uniqueGrid.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 100 ? "#3f3f46" : "#27272a"}
              strokeWidth={1}
              strokeDasharray={v === 100 ? "0" : "3 3"}
            />
            <text x={8} y={y(v) + 4} fill="#71717a" fontSize={11}>
              {v}
            </text>
          </g>
        ))}

        {/* SPY (benchmark) — dashed, recessive */}
        {curve.spyReturnPct != null && (
          <path
            d={line("spyIndex")}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}
        {/* Portfolio — solid, emphasis */}
        <path
          d={line("portfolioIndex")}
          fill="none"
          stroke="#34d399"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        <text x={PAD.left} y={H - 8} fill="#71717a" fontSize={11}>
          {firstDate}
        </text>
        <text x={W - PAD.right} y={H - 8} fill="#71717a" fontSize={11} textAnchor="end">
          {lastDate}
        </text>
      </svg>
    </div>
  );
}

function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-400">
      <svg width={20} height={8} aria-hidden>
        <line
          x1={0}
          y1={4}
          x2={20}
          y2={4}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={dashed ? "5 4" : "0"}
        />
      </svg>
      {label}
    </span>
  );
}

function Tile({
  label,
  value,
  color = "text-zinc-100",
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}
