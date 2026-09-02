import type { ReactNode, InputHTMLAttributes } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions";
import { getOrCreateDefaultAccount, listTransactions } from "@/lib/trades";
import { listWatchlist } from "@/lib/watchlist";
import { computePositions, withQuotes, summarize } from "@/lib/portfolio";
import { getQuoteData, quotesEnabled } from "@/lib/quotes";
import { getMarketStatus } from "@/lib/market";
import { createTrade, deleteTrade } from "@/app/portfolio-actions";
import { addWatch, removeWatch } from "@/app/watchlist-actions";
import {
  money,
  signedMoney,
  percent,
  shares as fmtShares,
  pnlColor,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; werror?: string }>;
}) {
  const { error, werror } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getOrCreateDefaultAccount(session.sub);
  const [txns, watchlist] = await Promise.all([
    listTransactions(account.id),
    listWatchlist(session.sub),
  ]);

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

  // One quote fetch for everything (holdings + watchlist).
  const symbols = [
    ...new Set([...held.map((p) => p.symbol), ...watchlist.map((w) => w.symbol)]),
  ];
  const quoteData = await getQuoteData(symbols);

  const priceMap: Record<string, number | undefined> = {};
  for (const [sym, q] of Object.entries(quoteData)) priceMap[sym] = q?.price;

  const withMarket = withQuotes(positions, priceMap);
  const heldWithMarket = withMarket.filter((p) => p.shares.gt(0));
  const summary = summarize(withMarket);
  const market = getMarketStatus();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Stock<span className="text-emerald-400">Wallet</span>
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                market.open
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  market.open ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              {market.label}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <Link
              href="/ideas"
              className="rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40"
            >
              💡 Ideas
            </Link>
            <Link
              href="/journal"
              className="rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40"
            >
              🎯 Journal
            </Link>
            <span>{session.username}</span>
            <form action={logout}>
              <button className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800">
                Sign out
              </button>
            </form>
          </div>
        </header>

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Summary tiles */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Market Value" value={money(summary.totalMarketValue)} />
          <Tile
            label="Unrealized P/L"
            value={signedMoney(summary.totalUnrealizedPnL)}
            color={pnlColor(summary.totalUnrealizedPnL)}
          />
          <Tile label="Cost Basis" value={money(summary.totalCostBasis)} />
          <Tile
            label="Realized P/L"
            value={signedMoney(summary.totalRealizedPnL)}
            color={pnlColor(summary.totalRealizedPnL)}
          />
        </section>

        {!quotesEnabled() && (
          <p className="-mt-4 text-xs text-zinc-500">
            Live prices are off — add a Finnhub API key to see market value and
            unrealized P/L. Cost basis and realized P/L are exact either way.
          </p>
        )}

        {/* Holdings */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Holdings</SectionTitle>
          {heldWithMarket.length === 0 ? (
            <Empty>No open positions yet. Add a trade below to get started.</Empty>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <Th>Symbol</Th>
                    <Th right>Shares</Th>
                    <Th right>Avg Cost</Th>
                    <Th right>Cost Basis</Th>
                    <Th right>Price</Th>
                    <Th right>Day</Th>
                    <Th right>Mkt Value</Th>
                    <Th right>Unrealized</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {heldWithMarket.map((p) => {
                    const dp = quoteData[p.symbol]?.changePct ?? null;
                    return (
                      <tr key={p.symbol} className="hover:bg-zinc-900/40">
                        <Td className="font-semibold text-emerald-400">{p.symbol}</Td>
                        <Td right>{fmtShares(p.shares)}</Td>
                        <Td right>{money(p.avgCost)}</Td>
                        <Td right>{money(p.costBasis)}</Td>
                        <Td right>{money(p.price)}</Td>
                        <Td right className={pnlColor(dp)}>{percent(dp)}</Td>
                        <Td right>{money(p.marketValue)}</Td>
                        <Td right className={pnlColor(p.unrealizedPnL)}>
                          {signedMoney(p.unrealizedPnL)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        {/* Watchlist */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Watchlist</SectionTitle>
          {werror && <ErrorNote>{werror}</ErrorNote>}
          {watchlist.length > 0 && (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <Th>Symbol</Th>
                    <Th right>Price</Th>
                    <Th right>Day</Th>
                    <Th>Note</Th>
                    <Th right>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {watchlist.map((w) => {
                    const q = quoteData[w.symbol];
                    return (
                      <tr key={w.id} className="hover:bg-zinc-900/40">
                        <Td className="font-semibold">{w.symbol}</Td>
                        <Td right>{q ? money(q.price) : "—"}</Td>
                        <Td right className={pnlColor(q?.changePct ?? null)}>
                          {q ? percent(q.changePct) : "—"}
                        </Td>
                        <Td className="text-zinc-400">{w.note ?? ""}</Td>
                        <Td right>
                          <form action={removeWatch}>
                            <input type="hidden" name="id" value={w.id} />
                            <button className="text-red-400 underline hover:text-red-300">
                              Remove
                            </button>
                          </form>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
          <form
            action={addWatch}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <Input name="symbol" label="Add ticker" placeholder="AAPL" required />
            <Input name="note" label="Note (optional)" placeholder="earnings 5/1" />
            <button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
              Watch
            </button>
          </form>
        </section>

        {/* Add trade */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Add a trade</SectionTitle>
          <form
            action={createTrade}
            className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-7"
          >
            <Input name="symbol" label="Ticker" placeholder="AAPL" required />
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Side</span>
              <select
                name="side"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </div>
            <Input name="quantity" label="Quantity" type="number" step="any" placeholder="10" required />
            <Input name="price" label="Price / share" type="number" step="any" placeholder="150.00" required />
            <Input name="fees" label="Fees" type="number" step="any" placeholder="0" />
            <Input name="tradedAt" label="Date" type="date" defaultValue={today} />
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
                Add
              </button>
            </div>
          </form>
        </section>

        {/* Transactions ledger */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Transactions</SectionTitle>
          {txns.length === 0 ? (
            <Empty>No transactions logged yet.</Empty>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <Th>Date</Th>
                    <Th>Symbol</Th>
                    <Th>Side</Th>
                    <Th right>Qty</Th>
                    <Th right>Price</Th>
                    <Th right>Fees</Th>
                    <Th right>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {txns.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-900/40">
                      <Td>{t.tradedAt.toISOString().slice(0, 10)}</Td>
                      <Td className="font-medium">{t.symbol}</Td>
                      <Td>
                        <span
                          className={
                            t.side === "BUY" ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {t.side}
                        </span>
                      </Td>
                      <Td right>{fmtShares(t.quantity)}</Td>
                      <Td right>{money(t.price)}</Td>
                      <Td right>{money(t.fees)}</Td>
                      <Td right>
                        <div className="flex justify-end gap-3">
                          <Link
                            href={`/trades/${t.id}/edit`}
                            className="text-zinc-400 underline hover:text-zinc-200"
                          >
                            Edit
                          </Link>
                          <form action={deleteTrade}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-red-400 underline hover:text-red-300">
                              Delete
                            </button>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        <p className="pb-4 text-center text-xs text-zinc-600">
          Not financial advice. A tracking and reflection tool.
        </p>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  color = "text-zinc-100",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
      {children}
    </h2>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
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

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">{children}</div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
}

function Input({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <input
        {...props}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
      />
    </label>
  );
}
