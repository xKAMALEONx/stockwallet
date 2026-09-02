import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultAccount, listTransactions } from "@/lib/trades";
import { listJournal } from "@/lib/journal";
import { computePositions, withQuotes } from "@/lib/portfolio";
import { getQuoteData } from "@/lib/quotes";
import { getFundamentals } from "@/lib/fundamentals";
import { evaluateTrade, type GuardInput, type CheckStatus } from "@/lib/guard";

export const dynamic = "force-dynamic";

const DAY = 86400000;

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; action?: string; amount?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const symbol = (sp.symbol ?? "").trim().toUpperCase();
  const action: "BUY" | "SELL" = sp.action === "SELL" ? "SELL" : "BUY";
  const amountUsd = Number(sp.amount ?? "") || 0;

  let result: ReturnType<typeof evaluateTrade> | null = null;

  if (symbol) {
    const account = await getOrCreateDefaultAccount(session.sub);
    const [txns, journal] = await Promise.all([
      listTransactions(account.id),
      listJournal(session.sub),
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
    const quoteSymbols = [...new Set([symbol, ...held.map((p) => p.symbol)])];
    const quoteData = await getQuoteData(quoteSymbols);
    const priceMap: Record<string, number | undefined> = {};
    for (const [s, q] of Object.entries(quoteData)) priceMap[s] = q?.price;

    const withMarket = withQuotes(positions, priceMap);
    const heldWM = withMarket.filter((p) => p.shares.gt(0));
    let portfolioValue = 0;
    for (const p of heldWM) if (p.marketValue) portfolioValue += p.marketValue.toNumber();
    const existing = heldWM.find((p) => p.symbol === symbol);
    const existingPositionValue = existing?.marketValue
      ? existing.marketValue.toNumber()
      : 0;

    const fundamentals = await getFundamentals(symbol);
    const q = quoteData[symbol];

    const buys = txns.filter((t) => t.symbol === symbol && t.side === "BUY");
    const earliest = buys.length
      ? Math.min(...buys.map((t) => t.tradedAt.getTime()))
      : null;
    const positionAgeDays =
      earliest != null ? Math.floor((Date.now() - earliest) / DAY) : null;

    const cutoff = Date.now() - 182 * DAY;
    const recentTradeCount6mo = txns.filter(
      (t) => t.symbol === symbol && t.tradedAt.getTime() >= cutoff,
    ).length;

    const hasLongThesis = journal.some(
      (e) =>
        e.symbol === symbol &&
        e.status === "OPEN" &&
        e.timeframe != null &&
        new Date(e.timeframe).getTime() - new Date(e.createdAt).getTime() >=
          330 * DAY,
    );

    const input: GuardInput = {
      action,
      amountUsd,
      price: q?.price ?? null,
      dayChangePct: q?.changePct ?? null,
      week52High: fundamentals?.week52High ?? null,
      peTTM: fundamentals?.peTTM ?? null,
      portfolioValue,
      existingPositionValue,
      positionAgeDays,
      recentTradeCount6mo,
      hasLongThesis,
    };
    result = evaluateTrade(input);
  }

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Trade Guard 🛡️</h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Run a trade you&apos;re <em>thinking about</em> through your long-term rules
          before you place it in your brokerage. Nothing is blocked — this is a
          20-second gut check to catch the trades you&apos;d regret.
        </p>

        {/* Check form (GET) */}
        <form method="GET" className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Ticker</span>
            <input
              name="symbol"
              defaultValue={symbol}
              placeholder="AAPL"
              required
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Action</span>
            <select
              name="action"
              defaultValue={action}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Amount $ (for buys)</span>
            <input
              name="amount"
              type="number"
              step="any"
              defaultValue={amountUsd || ""}
              placeholder="500"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
              Check
            </button>
          </div>
        </form>

        {result && (
          <section className="flex flex-col gap-4">
            <VerdictBanner verdict={result.verdict} symbol={symbol} action={action} />
            <div className="flex flex-col gap-2">
              {result.checks.map((c) => (
                <div
                  key={c.id}
                  className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
                >
                  <StatusDot status={c.status} />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{c.label}</p>
                    <p className="text-xs text-zinc-400">{c.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Link
                href="/journal"
                className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40"
              >
                Log a thesis first →
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function VerdictBanner({
  verdict,
  symbol,
  action,
}: {
  verdict: "GREEN" | "CAUTION" | "RED";
  symbol: string;
  action: string;
}) {
  const map = {
    GREEN: {
      cls: "border-emerald-700 bg-emerald-950/40 text-emerald-200",
      emoji: "🟢",
      title: "Looks disciplined",
      sub: "No rules tripped. This fits your long-term plan.",
    },
    CAUTION: {
      cls: "border-amber-700 bg-amber-950/30 text-amber-200",
      emoji: "🟡",
      title: "Caution — check the flags",
      sub: "Not a no, but slow down and make sure you're not fooling yourself.",
    },
    RED: {
      cls: "border-red-800 bg-red-950/40 text-red-200",
      emoji: "🔴",
      title: "Red flag",
      sub: "A hard rule tripped. Strongly reconsider before you place this.",
    },
  }[verdict];

  return (
    <div className={`rounded-lg border px-5 py-4 ${map.cls}`}>
      <p className="text-lg font-bold">
        {map.emoji} {map.title}
      </p>
      <p className="mt-1 text-sm opacity-90">
        {action === "BUY" ? "Buying" : "Selling"} {symbol} — {map.sub}
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: CheckStatus }): ReactNode {
  const cls =
    status === "ok"
      ? "bg-emerald-400"
      : status === "warn"
        ? "bg-amber-400"
        : "bg-red-500";
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />;
}
