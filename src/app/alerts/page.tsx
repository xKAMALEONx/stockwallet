import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listAlerts } from "@/lib/alerts";
import { getQuoteData } from "@/lib/quotes";
import { createAlert, deleteAlert } from "@/app/alert-actions";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const alerts = await listAlerts(session.sub);
  const quoteData = await getQuoteData(alerts.map((a) => a.symbol));

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Alerts 🔔</h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Set a price target and I&apos;ll ping you when it hits — plus nudges when a
          thesis is ready to grade or you logged a buy without a reason. Checked on a
          schedule and delivered to you directly.
        </p>

        {/* Add alert */}
        <form
          action={createAlert}
          className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Ticker</span>
            <input
              name="symbol"
              placeholder="NVDA"
              required
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Condition</span>
            <select
              name="direction"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="ABOVE">Rises above</option>
              <option value="BELOW">Falls below</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Target price ($)</span>
            <input
              name="targetPrice"
              type="number"
              step="any"
              placeholder="250"
              required
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
              Add alert
            </button>
          </div>
        </form>
        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Alerts list */}
        {alerts.length === 0 ? (
          <Empty>No alerts yet. Add one above.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 font-medium">Condition</th>
                  <th className="px-3 py-2 text-right font-medium">Target</th>
                  <th className="px-3 py-2 text-right font-medium">Now</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {alerts.map((a) => {
                  const price = quoteData[a.symbol]?.price ?? null;
                  const target = a.targetPrice.toNumber();
                  const met =
                    price == null
                      ? null
                      : a.direction === "ABOVE"
                        ? price >= target
                        : price <= target;
                  return (
                    <tr key={a.id} className="hover:bg-zinc-900/40">
                      <td className="px-3 py-2 font-semibold text-emerald-400">
                        {a.symbol}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {a.direction === "ABOVE" ? "Rises above" : "Falls below"}
                      </td>
                      <td className="px-3 py-2 text-right">{money(target)}</td>
                      <td className="px-3 py-2 text-right">
                        {price == null ? "—" : money(price)}
                      </td>
                      <td className="px-3 py-2">
                        {met == null ? (
                          <span className="text-zinc-500">—</span>
                        ) : met ? (
                          <span className="text-emerald-400">✓ triggered</span>
                        ) : (
                          <span className="text-zinc-500">watching</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <form action={deleteAlert}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="text-red-400 underline hover:text-red-300">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
      {children}
    </p>
  );
}
