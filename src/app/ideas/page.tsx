import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getNewsIdeas,
  newsEnabled,
  sentimentLabel,
  type Idea,
} from "@/lib/news";
import {
  getConsensus,
  getFundamentals,
  consensusLabel,
  type Consensus,
  type Fundamentals,
} from "@/lib/fundamentals";
import { getQuoteData, type Quote } from "@/lib/quotes";
import { addWatch } from "@/app/watchlist-actions";
import { money, percent, pnlColor } from "@/lib/format";

export const dynamic = "force-dynamic";

function toneClass(tone: "pos" | "neg" | "neutral"): string {
  if (tone === "pos") return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
  if (tone === "neg") return "border-red-900 bg-red-950/40 text-red-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-400";
}

export default async function IdeasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Candidates surfaced from the news → keep only quotable US tickers (drops
  // OTC/foreign) → then require real analyst coverage (drops PR-wire noise and
  // guarantees the long-term lens is populated). Cap at 8.
  const candidates = await getNewsIdeas();
  const quoteData = await getQuoteData(candidates.map((i) => i.symbol));
  const quotable = candidates.filter((i) => quoteData[i.symbol]);

  const withConsensus = await Promise.all(
    quotable.map(async (i) => ({ idea: i, consensus: await getConsensus(i.symbol) })),
  );
  const covered = withConsensus.filter((x) => x.consensus !== null).slice(0, 8);

  const lensList = await Promise.all(
    covered.map(async (x) => ({
      symbol: x.idea.symbol,
      consensus: x.consensus,
      fundamentals: await getFundamentals(x.idea.symbol),
    })),
  );
  const lensBySym = new Map(lensList.map((l) => [l.symbol, l]));
  const ideas = covered.map((x) => x.idea);

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
            <span className="text-sm text-zinc-500">surfaced from the news</span>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Tickers trending in the news, with analyst consensus and valuation as a
          long-term lens. <span className="text-zinc-400">Not financial advice</span> —
          these are starting points for your own research, always with sources linked.
        </p>

        {!newsEnabled() ? (
          <Empty>News source not configured.</Empty>
        ) : ideas.length === 0 ? (
          <Empty>No ideas surfaced right now — check back after the next refresh.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.symbol}
                idea={idea}
                quote={quoteData[idea.symbol]}
                consensus={lensBySym.get(idea.symbol)?.consensus ?? null}
                fundamentals={lensBySym.get(idea.symbol)?.fundamentals ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  quote,
  consensus,
  fundamentals,
}: {
  idea: Idea;
  quote: Quote | undefined;
  consensus: Consensus;
  fundamentals: Fundamentals;
}) {
  const sent = sentimentLabel(idea.avgSentiment);
  const cons = consensusLabel(consensus);

  // 52-week range position (where current price sits).
  let rangePct: number | null = null;
  if (
    quote &&
    fundamentals?.week52High != null &&
    fundamentals?.week52Low != null &&
    fundamentals.week52High > fundamentals.week52Low
  ) {
    rangePct =
      ((quote.price - fundamentals.week52Low) /
        (fundamentals.week52High - fundamentals.week52Low)) *
      100;
    rangePct = Math.max(0, Math.min(100, rangePct));
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-emerald-400">{idea.symbol}</span>
          {quote && (
            <span className="text-sm text-zinc-300">
              {money(quote.price)}{" "}
              <span className={pnlColor(quote.changePct)}>
                {percent(quote.changePct)}
              </span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={sent.tone}>News: {sent.label}</Badge>
          <Badge tone={cons.tone}>Analysts: {cons.label}</Badge>
        </div>
      </div>

      {/* Long-term lens */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
        {consensus && (
          <span>
            Consensus: {consensus.strongBuy + consensus.buy} buy ·{" "}
            {consensus.hold} hold · {consensus.sell + consensus.strongSell} sell
          </span>
        )}
        {fundamentals?.peTTM != null && (
          <span>P/E {fundamentals.peTTM.toFixed(1)}</span>
        )}
        {fundamentals?.week52Low != null && fundamentals?.week52High != null && (
          <span>
            52wk {money(fundamentals.week52Low)}–{money(fundamentals.week52High)}
            {rangePct != null && ` (${rangePct.toFixed(0)}% of range)`}
          </span>
        )}
      </div>

      {/* Headlines */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {idea.articles.slice(0, 3).map((a) => (
          <li key={a.url} className="text-sm">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100"
            >
              {a.title}
            </a>{" "}
            <span className="text-xs text-zinc-600">— {a.source}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <form action={addWatch}>
          <input type="hidden" name="symbol" value={idea.symbol} />
          <button className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40">
            + Watch
          </button>
        </form>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "pos" | "neg" | "neutral";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${toneClass(tone)}`}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}
