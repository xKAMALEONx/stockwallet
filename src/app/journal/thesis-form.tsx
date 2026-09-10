"use client";

import { useState, useTransition } from "react";

// The auto-fill Bet Journal form. When you type a ticker and leave the field,
// it asks /api/suggest for a backtested conviction + long-term compounding
// target and fills them in — you can still override anything before logging.
// Jaime's ask: stop making him guess; let the system decide, keep the override.

type Suggestion = {
  conviction: "LOW" | "MEDIUM" | "HIGH";
  targetPrice: number | null;
  horizonYears: number;
  targetMultiple: number | null;
  projectedCagrPct: number | null;
  rationale: string;
  confident: boolean;
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
      // Only auto-fill fields the user hasn't manually touched.
      if (!touched) {
        setConviction(s.conviction);
        setTarget(s.targetPrice != null ? String(s.targetPrice) : "");
      }
    } catch {
      // silent — form still works, defaults stand
    } finally {
      setLoading(false);
    }
  }

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
        <span className="text-zinc-400">Target $ (5yr)</span>
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

      {/* The system's read — shows what it decided and why. Editable above. */}
      {suggestion && (
        <div className="col-span-2 sm:col-span-6">
          <p className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs leading-5 text-emerald-200/80">
            🐼 <span className="font-semibold text-emerald-300">Po&apos;s read:</span>{" "}
            {suggestion.rationale}
            {suggestion.confident && suggestion.targetMultiple != null && (
              <span className="text-emerald-400/70">
                {" "}
                (that&apos;s the compounding path toward multiplying your money — override if you disagree.)
              </span>
            )}
          </p>
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
