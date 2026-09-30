"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importRobinhood, type ImportState } from "@/app/import-actions";

const initial: ImportState = { phase: "idle" };

export default function ImportPage() {
  const [state, action, pending] = useActionState(importRobinhood, initial);

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Import from Robinhood 🏹</h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Export your <strong>account activity report</strong> from Robinhood (Account →
          Reports and statements → Reports → CSV, full date range). Upload it here — I&apos;ll
          pull in every buy and sell, skip dividends and transfers, and never double-count if
          you re-import. Nothing is written until you confirm the preview.
        </p>

        {/* Upload form */}
        <form action={action} className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <label className="text-sm font-medium text-zinc-300">Robinhood CSV</label>
          <input
            type="file"
            name="csv"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-100 hover:file:bg-zinc-700"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-1 self-start rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Reading…" : "Preview import"}
          </button>
        </form>

        {/* Error */}
        {state.phase === "error" && (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {state.message}
          </p>
        )}

        {/* Done */}
        {state.phase === "done" && (
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
            <p className="font-medium">{state.message}</p>
            <Link href="/" className="mt-2 inline-block underline underline-offset-2">
              View your portfolio →
            </Link>
          </div>
        )}

        {/* Preview */}
        {state.phase === "preview" && (
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Trades found" value={state.parsed ?? 0} />
              <Stat label="New to import" value={state.newCount ?? 0} accent />
              <Stat label="Already imported" value={state.duplicateCount ?? 0} />
            </div>
            {state.skippedSummary && (
              <p className="text-xs text-zinc-500">Skipped non-trade rows: {state.skippedSummary}</p>
            )}

            {state.sample && state.sample.length > 0 && (
              <div className="overflow-hidden rounded-md border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">Side</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sample.map((t, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="px-3 py-2 font-medium">{t.symbol}</td>
                        <td className={`px-3 py-2 ${t.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.side}</td>
                        <td className="px-3 py-2 tabular-nums">{t.quantity}</td>
                        <td className="px-3 py-2 tabular-nums">${t.price}</td>
                        <td className="px-3 py-2 text-zinc-400">{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(state.newCount ?? 0) > (state.sample?.length ?? 0) && (
                  <p className="bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                    …and {(state.newCount ?? 0) - (state.sample?.length ?? 0)} more.
                  </p>
                )}
              </div>
            )}

            {(state.newCount ?? 0) > 0 ? (
              <form action={action} className="flex items-center gap-3">
                <input type="hidden" name="confirm" value="1" />
                <input type="hidden" name="csvText" value={state.csv ?? ""} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pending ? "Importing…" : `Confirm — import ${state.newCount} trades`}
                </button>
                <span className="text-xs text-zinc-500">This writes to your ledger.</span>
              </form>
            ) : (
              <p className="text-sm text-zinc-400">
                Nothing new to import — every trade in this file is already in your ledger.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`text-2xl font-bold tabular-nums ${accent ? "text-emerald-400" : "text-zinc-100"}`}>{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}
