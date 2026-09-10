"use client";

import { useState, useTransition } from "react";
import { targetImplications } from "@/lib/target-math";

// The auto-fill Bet Journal form. When you type a ticker and leave the field,
// it asks /api/suggest for a backtested conviction + long-term compounding
// target and fills them in — you can still override anything before logging.
// Jaime's ask: stop making him guess; let the system decide, keep the override.

type FairValue = {
  fairValue: number | null;
  verdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "UNKNOWN";
  discountPct: number | null;
  justifiedPE: number | null;
  epsUsed: number | null;
  growthUsed: number | null;
  method: "earnings" | "range" | "none";
  rationale: string;
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

export default function ThesisForm({
  action,
  today,
}: {
  action: (formData: FormData) => void;
  today: string;
}) {
  const [symbol, setSymbol] = useState("");
  const [conviction, setConviction] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [target, setTarget] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false); // user hand-edited → don't stomp
  const [, startTransition] = useTransition();

  async function fetchSuggestion(sym: string) {
    const clean = sym.trim().toUpperCase();
    if (!SYMBOL_RE.test(clean)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suggest?symbol=${encodeURIComponent(clean)}`);
      if (!res.ok) return;
      const s: Suggestion = await res.json();
      setSuggestion(s);
      // Only auto-fill fields the user hasn't manually touched. Default the
      // target to the earnings-based fair value when we have one (the "good
      // price right now" read); otherwise fall back to the growth-path target.
      if (!touched) {
        setConviction(s.conviction);
        const defaultTarget =
          s.fair && s.fair.method === "earnings" && s.fair.fairValue != null
            ? s.fair.fairValue
            : s.targetPrice;
        setTarget(defaultTarget != null ? String(defaultTarget) : "");
      }
    } catch {
      // silent — form still works, defaults stand
    } finally {
      setLoading(false);
    }
  }

  // Live implications of whatever target is currently in the box — recomputes
  // as you type, so overriding the suggestion never leaves stale numbers.
  const targetNum = target.trim() ? Number(target) : null;
  const impl =
    suggestion && targetNum != null && Number.isFinite(targetNum)
      ? targetImplications(
          targetNum,
          suggestion.price,
          suggestion.horizonYears,
          suggestion.fair?.fairValue ?? null,
        )
      : null;
  // Does the typed target differ from what we auto-suggested? (then it's "yours")
  const isCustomTarget =
    suggestion != null &&
    targetNum != null &&
    targetNum !== suggestion.targetPrice &&
    targetNum !== (suggestion.fair?.fairValue ?? null);

  return (
    <form
      action={action}
      className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-6"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Ticker</span>
        <input
          name="symbol"
          placeholder="NVDA"
          required
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onBlur={() => startTransition(() => void fetchSuggestion(symbol))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Direction</span>
        <select
          name="direction"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        >
          <option value="BULL">Bullish</option>
          <option value="BEAR">Bearish</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">
          Conviction {loading && <span className="text-zinc-600">…</span>}
        </span>
        <select
          name="conviction"
          value={conviction}
          onChange={(e) => {
            setTouched(true);
            setConviction(e.target.value as "LOW" | "MEDIUM" | "HIGH");
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Target $</span>
        <input
          name="targetPrice"
          type="number"
          step="any"
          placeholder="200"
          value={target}
          onChange={(e) => {
            setTouched(true);
            setTarget(e.target.value);
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">By (date)</span>
        <input
          name="timeframe"
          type="date"
          defaultValue={today}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>

      <div className="col-span-2 flex items-end sm:col-span-1">
        <button className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
          Log
        </button>
      </div>

      {/* The system's read — two lenses on a "good target", each with the math.
          Pick whichever fits your thesis; the field above stays editable. */}
      {suggestion && (
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-6">
          {/* Lens 1: long-term compounding growth path */}
          <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs leading-5 text-emerald-200/80">
            <div className="flex items-start justify-between gap-2">
              <p>
                🐼 <span className="font-semibold text-emerald-300">Growth path:</span>{" "}
                {suggestion.rationale}
                {suggestion.confident && suggestion.targetMultiple != null && (
                  <span className="text-emerald-400/70">
                    {" "}
                    (compounding toward multiplying your money.)
                  </span>
                )}
              </p>
              {suggestion.targetPrice != null && (
                <button
                  type="button"
                  onClick={() => {
                    setTouched(true);
                    setTarget(String(suggestion.targetPrice));
                  }}
                  className="shrink-0 rounded border border-emerald-700 px-2 py-0.5 text-emerald-300 hover:bg-emerald-900/40"
                >
                  Use ${suggestion.targetPrice}
                </button>
              )}
            </div>
          </div>

          {/* Lens 2: earnings-based fair value (cheap / fair / expensive now) */}
          {suggestion.fair && suggestion.fair.method !== "none" && (
            <div
              className={`rounded-md border px-3 py-2 text-xs leading-5 ${
                suggestion.fair.verdict === "UNDERVALUED"
                  ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200/80"
                  : suggestion.fair.verdict === "OVERVALUED"
                    ? "border-amber-900/40 bg-amber-950/20 text-amber-200/80"
                    : "border-zinc-700 bg-zinc-900/40 text-zinc-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p>
                  ⚖️{" "}
                  <span className="font-semibold">
                    Fair value{suggestion.fair.method === "range" ? " (rough)" : ""}:
                  </span>{" "}
                  {suggestion.fair.rationale}
                </p>
                {suggestion.fair.fairValue != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setTouched(true);
                      setTarget(String(suggestion.fair!.fairValue));
                    }}
                    className="shrink-0 rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-800"
                  >
                    Use ${suggestion.fair.fairValue}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live read of the target currently in the box — updates as you type
              so your own number is never left unexplained. */}
          {impl && impl.multiple != null && (
            <div className="rounded-md border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-xs leading-5 text-sky-200/80">
              🎯{" "}
              <span className="font-semibold text-sky-300">
                {isCustomTarget ? "Your target" : "This target"} ${targetNum}:
              </span>{" "}
              {impl.note}
            </div>
          )}
        </div>
      )}

      <div className="col-span-2 sm:col-span-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Thesis / reasoning</span>
          <textarea
            name="thesis"
            required
            rows={2}
            placeholder="Why does this play out? What's the catalyst?"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
      </div>
    </form>
  );
}
