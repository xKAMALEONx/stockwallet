import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultAccount, listTransactions } from "@/lib/trades";
import { listJournal } from "@/lib/journal";
import { computePositions, withQuotes } from "@/lib/portfolio";
import { getQuoteData, isCryptoSymbol } from "@/lib/quotes";
import { getFundamentals } from "@/lib/fundamentals";
import { evaluateTrade, type GuardInput, type CheckStatus } from "@/lib/guard";
import { getSymbolNews, newsTradeSummary, type NewsArticle } from "@/lib/news";

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
  const isCrypto = symbol ? isCryptoSymbol(symbol) : false;

  let result: ReturnType<typeof evaluateTrade> | null = null;
  let peValue: number | null = null;
  let projConcentration: number | null = null;
  let newsData: { avgSentiment: number | null; articles: NewsArticle[] } | null =
    null;

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
      isCrypto,
    };
    result = evaluateTrade(input);

    peValue = fundamentals?.peTTM ?? null;
    const denom = portfolioValue + amountUsd;
    projConcentration =
      denom > 0 ? ((existingPositionValue + amountUsd) / denom) * 100 : null;

    newsData = await getSymbolNews(symbol);
  }

  const newsSummary = newsData
    ? newsTradeSummary(
        newsData.avgSentiment,
        action,
        newsData.articles.length > 0,
      )
    : null;

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
            <span className="text-zinc-400">How much you&apos;ll invest ($)</span>
            <input
              name="amount"
              type="number"
              step="any"
              defaultValue={amountUsd || ""}
              placeholder="e.g. 500"
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

            {newsSummary && newsData && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-medium">
                  📰{" "}
                  <span
                    className={
                      newsSummary.tone === "pos"
                        ? "text-emerald-300"
                        : newsSummary.tone === "neg"
                          ? "text-red-300"
                          : "text-zinc-300"
                    }
                  >
                    {newsSummary.lean}
                  </span>
                </p>
                <p className="mt-1 text-xs text-zinc-400">{newsSummary.nuance}</p>
                {newsData.articles.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {newsData.articles.slice(0, 3).map((a) => (
                      <li key={a.url} className="text-xs">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100"
                        >
                          {a.title}
                        </a>
                        <span className="text-zinc-600"> — {a.source}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10px] text-zinc-600">
                  News sentiment is a quick vibe check, not a signal — not financial
                  advice.
                </p>
              </div>
            )}

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

            {action === "BUY" && (
              <div className="flex flex-col gap-5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
                  How to read the flags
                </h2>

                {/* P/E scale */}
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    Valuation — P/E
                    {isCrypto
                      ? ": n/a for crypto"
                      : peValue != null
                        ? `: ${peValue.toFixed(0)}`
                        : ": n/a"}
                  </p>
                  {isCrypto ? (
                    <p className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                      P/E doesn&apos;t apply to crypto — a coin has no company earnings
                      to price. Judge it on your thesis, position size, and the news
                      instead.
                    </p>
                  ) : (
                    <Meter
                      value={peValue}
                      max={60}
                      boundaries={[25, 40]}
                      zones={[
                        { upTo: 25, cls: "bg-emerald-500/40" },
                        { upTo: 40, cls: "bg-amber-500/40" },
                        { upTo: 60, cls: "bg-red-500/40" },
                      ]}
                    />
                  )}
                  <div className="flex justify-between text-[10px] uppercase tracking-wide text-zinc-500">
                    <span>Normal ≤25</span>
                    <span>Pricey 25–40</span>
                    <span>Expensive 40+</span>
                  </div>
                  <p className="text-xs leading-5 text-zinc-400">
                    <strong className="text-zinc-300">P/E</strong> is the price tag on
                    $1 of the company&apos;s yearly profit — roughly how many years of
                    today&apos;s profit you&apos;re paying for. Higher = you&apos;re
                    paying more and betting on bigger growth. Not bad on its own; a
                    fast grower earns a higher P/E.
                  </p>
                </div>

                {/* Concentration scale */}
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    Concentration
                    {projConcentration != null
                      ? `: ~${projConcentration.toFixed(0)}% of portfolio`
                      : ""}
                  </p>
                  <Meter
                    value={projConcentration}
                    max={50}
                    boundaries={[25]}
                    zones={[
                      { upTo: 25, cls: "bg-emerald-500/40" },
                      { upTo: 50, cls: "bg-red-500/40" },
                    ]}
                  />
                  <div className="flex justify-between text-[10px] uppercase tracking-wide text-zinc-500">
                    <span>Safe ≤25%</span>
                    <span>Too much 25%+</span>
                  </div>
                  <p className="text-xs leading-5 text-zinc-400">
                    <strong className="text-zinc-300">Concentration</strong> is how much
                    of your whole portfolio sits in this one stock. Keep any single name
                    under <strong className="text-zinc-300">25%</strong> so one bad pick
                    can&apos;t sink you.
                  </p>
                </div>
              </div>
            )}

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

function Meter({
  value,
  max,
  zones,
  boundaries,
}: {
  value: number | null;
  max: number;
  zones: { upTo: number; cls: string }[];
  boundaries: number[];
}) {
  const pct = value == null ? null : Math.max(0, Math.min(100, (value / max) * 100));
  let prev = 0;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="flex h-full w-full">
        {zones.map((z, i) => {
          const w = ((z.upTo - prev) / max) * 100;
          prev = z.upTo;
          return <div key={i} className={z.cls} style={{ width: `${w}%` }} />;
        })}
      </div>
      {boundaries.map((b, i) => (
        <div
          key={i}
          className="absolute top-0 h-full w-px bg-zinc-600"
          style={{ left: `${(b / max) * 100}%` }}
        />
      ))}
      {pct != null && (
        <div
          className="absolute -top-1 h-5 w-1 rounded-full bg-white shadow"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      )}
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
