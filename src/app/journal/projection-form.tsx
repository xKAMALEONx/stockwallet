"use client";

// The "What can I expect?" panel. You give it a ticker, a dollar amount, and a
// horizon in years. It asks /api/suggest for the system's read (built from real
// multi-year history + analyst consensus), then projects everything to YOUR
// horizon: the rating, bull/bear direction, recommended conviction, a target
// price to reach, and what your money becomes if it gets there.
//
// The suggest engine returns a *tempered annual growth rate* (projectedCagrPct)
// and a 5yr target. We keep the rate and recompute the target for the horizon
// you pick, so "over 4 years" really means 4 years.

import { useState, useTransition } from "react";
import InfoTip from "@/app/components/InfoTip";

type FairValue = {
  fairValue: number | null;
  verdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "UNKNOWN";
  rationale: string;
  method: "earnings" | "range" | "none";
};

type Suggestion = {
  conviction: "LOW" | "MEDIUM" | "HIGH";
  targetPrice: number | null;
  horizonYears: number;
  targetMultiple: number | null;
  projectedCagrPct: number | null;
  rationale: string;
  confident: boolean;
  fair: FairValue | null;
  price: number | null;
};

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

const CONV_TONE: Record<string, string> = {
  HIGH: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  MEDIUM: "border-sky-700 bg-sky-950/30 text-sky-300",
  LOW: "border-amber-700 bg-amber-950/30 text-amber-300",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) =>
  n >= 10 ? `$${round2(n).toLocaleString()}` : `$${(Math.round(n * 10000) / 10000)}`;

export default function ProjectionForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [years, setYears] = useState("4");
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function analyze() {
    const clean = symbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(clean)) {
      setErr("Enter a valid ticker (e.g. AAPL).");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/suggest?symbol=${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error();
      setSug(await res.json());
    } catch {
      setErr("Couldn't fetch data for that ticker right now. Try again.");
      setSug(null);
    } finally {
      setLoading(false);
    }
  }

  // Recompute the projection for the user's chosen horizon off the tempered CAGR.
  const horizon = Math.max(1, Math.min(30, Math.round(Number(years) || 0)));
  const price = sug?.price ?? null;
  const cagr = sug?.projectedCagrPct ?? null;
  const target =
    price != null && cagr != null && horizon > 0
      ? round2(price * Math.pow(1 + cagr / 100, horizon))
      : null;
  const multiple = target != null && price ? round2(target / price) : null;

  const amountRaw = amount.trim() ? Number(amount) : null;
  const amountNum =
    amountRaw != null && Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  const shares = amountNum != null && price ? amountNum / price : null;
  const projectedValue = shares != null && target != null ? round2(shares * target) : null;
  const profit = projectedValue != null && amountNum != null ? round2(projectedValue - amountNum) : null;
  const returnPct =
    profit != null && amountNum ? Math.round((profit / amountNum) * 1000) / 10 : null;

  const direction: "BULL" | "BEAR" =
    cagr != null && cagr > 0 ? "BULL" : "BEAR";
  const rating =
    !sug?.confident
      ? "Insufficient history"
      : sug.conviction === "HIGH"
        ? "Strong long-term profile"
        : sug.conviction === "MEDIUM"
          ? "Decent long-term profile"
          : "Choppy — tread carefully";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Ticker</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                startTransition(() => void analyze());
              }
            }}
            placeholder="AAPL"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 uppercase text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">I&apos;d invest ($)</span>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Over (years)</span>
          <input
            type="number"
            min={1}
            max={30}
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => startTransition(() => void analyze())}
            disabled={loading}
            className="w-full rounded-md border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-900/40 disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* The read */}
      {sug && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReadTile label="Rating" term="proj-rating" value={rating} />
            <ReadTile
              label="Direction"
              term="proj-direction"
              value={direction === "BULL" ? "▲ Bullish" : "▼ Bearish"}
              tone={direction === "BULL" ? "text-emerald-400" : "text-red-400"}
            />
            <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2">
              <p className="flex items-center text-[10px] uppercase tracking-wide text-zinc-500">
                Conviction
                <InfoTip term="proj-conviction" />
              </p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${CONV_TONE[sug.conviction]}`}
              >
                {sug.conviction}
              </span>
            </div>
            <ReadTile
              label={`Target (${horizon}yr)`}
              term="proj-target"
              value={target != null ? `${fmt(target)}/sh` : "—"}
              sub={multiple != null ? `${multiple}× today` : undefined}
              subTerm="proj-multiple"
              tone="text-emerald-300"
            />
          </div>

          {/* Money projection */}
          {projectedValue != null && amountNum != null ? (
            <div className="rounded-md border border-indigo-900/40 bg-indigo-950/20 px-3 py-2.5 text-sm text-indigo-200/90">
              <span className="mb-0.5 flex items-center text-[10px] uppercase tracking-wide text-indigo-300/70">
                What your money could do
                <InfoTip term="proj-money" />
              </span>
              💵 Put in <strong>{fmt(amountNum)}</strong> today at {fmt(price!)} →
              about <strong className="text-indigo-200">{fmt(projectedValue)}</strong> in{" "}
              {horizon} years{" "}
              <span className={profit != null && profit >= 0 ? "text-emerald-400" : "text-red-400"}>
                ({profit != null && profit >= 0 ? "+" : ""}
                {fmt(profit!)}, {returnPct != null && returnPct >= 0 ? "+" : ""}
                {returnPct}%)
              </span>
              .
            </div>
          ) : (
            price != null && (
              <p className="text-xs text-zinc-500">
                Add an amount to see what your money could become. Live price {fmt(price)}.
              </p>
            )
          )}

          {/* Rationale + fair-value context */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs leading-5 text-zinc-400">
            <span className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
              <span className="flex items-center">
                Why <InfoTip term="fit" />
              </span>
              <span className="flex items-center">
                Growth rate <InfoTip term="proj-cagr" />
              </span>
              {sug.fair && sug.fair.method !== "none" && (
                <span className="flex items-center">
                  Fair value <InfoTip term="proj-fair-value" />
                </span>
              )}
            </span>
            🐼 {sug.rationale}
            {sug.fair && sug.fair.method !== "none" && (
              <>
                {" "}
                <span className="text-zinc-500">·</span> {sug.fair.rationale}
              </>
            )}
          </div>

          {/* Log it — posts the chosen numbers to the server action. */}
          {target != null && (
            <form action={action} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="symbol" value={symbol.trim().toUpperCase()} />
              <input type="hidden" name="direction" value={direction} />
              <input type="hidden" name="conviction" value={sug.conviction} />
              <input type="hidden" name="targetPrice" value={target} />
              <input type="hidden" name="horizonYears" value={horizon} />
              <input type="hidden" name="projectedCagr" value={cagr ?? ""} />
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-zinc-400">Note (optional)</span>
                <input
                  name="note"
                  placeholder="Why you like it…"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                />
              </label>
              <button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
                Track this pick
              </button>
            </form>
          )}
          <p className="text-[10px] text-zinc-600">
            Descriptive projection from past performance, not a prediction or financial advice.
          </p>
        </>
      )}
    </div>
  );
}

function ReadTile({
  label,
  value,
  sub,
  term,
  subTerm,
  tone = "text-zinc-100",
}: {
  label: string;
  value: string;
  sub?: string;
  term?: string;
  subTerm?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <p className="flex items-center text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
        {term && <InfoTip term={term} />}
      </p>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
      {sub && (
        <p className="flex items-center text-[10px] text-zinc-600">
          {sub}
          {subTerm && <InfoTip term={subTerm} />}
        </p>
      )}
    </div>
  );
}
