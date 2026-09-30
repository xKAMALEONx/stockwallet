import type { ReactNode } from "react";
import Link from "next/link";
import InfoTip from "@/app/components/InfoTip";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getGrowIdeas, newsEnabled, type GrowIdea } from "@/lib/grow-ideas-source";
import { sentimentLabel } from "@/lib/news";
import { consensusLabel } from "@/lib/fundamentals";
import { earningsSummary } from "@/lib/signals-earnings";
import { insiderSummary } from "@/lib/signals-insider";
import { scoreTier } from "@/lib/idea-score";
import type { SectorMomentum } from "@/lib/signals-sector";
import { addWatch } from "@/app/watchlist-actions";
import { money, percent, pnlColor } from "@/lib/format";

export const dynamic = "force-dynamic";

type Tone = "pos" | "neg" | "neutral";

function toneClass(tone: Tone): string {
  if (tone === "pos") return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
  if (tone === "neg") return "border-red-900 bg-red-950/40 text-red-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-400";
}

export default async function IdeasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { ideas, sectorMomentum } = await getGrowIdeas();

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
            <span className="hidden text-sm text-zinc-500 sm:inline">
              grow-the-money radar
            </span>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Every idea pairs <span className="text-zinc-300">what&apos;s happening now</span>{" "}
          — fresh news, Wall-Street analyst stance, earnings beats, insider buying,
          sector momentum — with its{" "}
          <span className="text-zinc-300">backtested track record</span>, so nothing is
          recommended on hype alone.{" "}
          <span className="text-zinc-400">Not financial advice</span> — starting points
          for your own research, sources linked.
        </p>

        {/* Sector momentum strip — where the money is flowing today. */}
        {sectorMomentum.length > 0 && <SectorStrip momentum={sectorMomentum} />}

        {!newsEnabled() ? (
          <Empty>News source not configured.</Empty>
        ) : ideas.length === 0 ? (
          <Empty>No fresh ideas surfaced right now — check back after the next refresh.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {ideas.map((idea) => (
              <IdeaCard key={idea.symbol} idea={idea} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal strip of the hottest & coldest sectors right now. */
function SectorStrip({ momentum }: { momentum: SectorMomentum[] }) {
  const top = momentum.slice(0, 3);
  const bottom = momentum.slice(-2).reverse();
  const chip = (m: SectorMomentum, tone: Tone) => (
    <span
      key={m.sector}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${toneClass(tone)}`}
    >
      {m.sector}
      <span className="font-mono">
        {m.returnPct! > 0 ? "+" : ""}
        {m.returnPct!.toFixed(1)}%
      </span>
    </span>
  );
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-2 flex items-center text-xs font-medium uppercase tracking-wide text-zinc-500">
        Sector momentum · last 3 months
        <InfoTip term="sector-momentum" />
      </div>
      <div className="flex flex-wrap gap-2">
        {top.map((m) => chip(m, "pos"))}
        <span className="px-1 text-zinc-600">·</span>
        {bottom.map((m) => chip(m, "neg"))}
      </div>
    </div>
  );
}

function IdeaCard({ idea }: { idea: GrowIdea }) {
  const { breakdown: b } = idea;
  const tier = scoreTier(b.score);
  const sent = sentimentLabel(idea.news.avgSentiment);
  const cons = consensusLabel(idea.consensus);
  const earn = earningsSummary(idea.earnings);
  const ins = insiderSummary(idea.insider);
  const s = idea.stats;

  // 52-week range position.
  let rangePct: number | null = null;
  const f = idea.fundamentals;
  if (
    idea.quote &&
    f?.week52High != null &&
    f?.week52Low != null &&
    f.week52High > f.week52Low
  ) {
    rangePct = Math.max(
      0,
      Math.min(
        100,
        ((idea.quote.price - f.week52Low) / (f.week52High - f.week52Low)) * 100,
      ),
    );
  }

  return (
    <div
      className={`rounded-lg border bg-zinc-900/40 p-5 ${
        b.conflict ? "border-amber-800/60" : "border-zinc-800"
      }`}
    >
      {/* Top row: symbol + price, and the composite score dial. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-emerald-400">{idea.symbol}</span>
          {idea.quote && (
            <span className="text-sm text-zinc-300">
              {money(idea.quote.price)}{" "}
              <span className={pnlColor(idea.quote.changePct)}>
                {percent(idea.quote.changePct)}
              </span>
            </span>
          )}
        </div>
        <ScoreDial score={b.score} tier={tier} fresh={b.freshScore} proof={b.proofScore} />
      </div>

      {/* Conflict flag — shown, not hidden (and the idea is already down-ranked). */}
      {b.conflict && b.conflictNote && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          <span className="mt-px">⚠️</span>
          <span>
            <span className="font-medium">Signals clash</span>
            <InfoTip term="conflict" /> — {b.conflictNote}
          </span>
        </div>
      )}

      {/* Signal badges — the fresh "why now" read. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={cons.tone}>Analysts: {cons.label}<InfoTip term="consensus" /></Badge>
        {idea.consensusDir !== 0 && (
          <Badge tone={idea.consensusDir > 0 ? "pos" : "neg"}>
            {idea.consensusDir > 0 ? "▲ warming" : "▼ cooling"}
            <InfoTip term="consensus-trend" />
          </Badge>
        )}
        <Badge tone={earn.tone}>{earn.label}<InfoTip term="earnings-surprise" /></Badge>
        {ins.tone !== "neutral" && (
          <Badge tone={ins.tone}>{ins.label}<InfoTip term="insider" /></Badge>
        )}
        <Badge tone={idea.sectorTone}>{idea.sectorLabel}<InfoTip term="sector-momentum" /></Badge>
        <Badge tone={sent.tone}>News: {sent.label}<InfoTip term="sentiment" /></Badge>
      </div>

      {/* Earnings radar — when a report is imminent. */}
      {idea.upcoming?.daysAway != null &&
        idea.upcoming.daysAway >= 0 &&
        idea.upcoming.daysAway <= 14 && (
          <div className="mt-3 inline-flex items-center rounded-md border border-sky-900 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-300">
            📅 Earnings in {idea.upcoming.daysAway === 0 ? "today" : `${idea.upcoming.daysAway}d`}
            <InfoTip term="earnings-radar" />
          </div>
        )}

      {/* Backtest PROOF panel — the buddy-system reality check. */}
      <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 flex items-center text-xs font-medium uppercase tracking-wide text-zinc-500">
          Backtested proof · 3yr
          <InfoTip term="proof" />
        </div>
        {s ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
            <Stat label="Fit" term="fit" value={s.fitScore != null ? `${s.fitScore}/100` : "—"} />
            <Stat
              label="Growth/yr"
              term="cagr"
              value={s.annualizedPct != null ? `${s.annualizedPct.toFixed(0)}%` : "—"}
            />
            <Stat
              label="Worst drop"
              term="max-drawdown"
              value={s.maxDrawdownPct != null ? `${s.maxDrawdownPct.toFixed(0)}%` : "—"}
            />
            {f?.peTTM != null && <Stat label="P/E" term="pe" value={f.peTTM.toFixed(1)} />}
            {rangePct != null && (
              <Stat label="52wk range" term="week-52" value={`${rangePct.toFixed(0)}%`} />
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No 3-year history available — this idea rests on the current signals only.
          </p>
        )}
      </div>

      {/* Headlines — the source, always linked. */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {idea.news.articles.slice(0, 3).map((a) => (
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

/** The composite score, with a fresh-vs-proof split underneath. */
function ScoreDial({
  score,
  tier,
  fresh,
  proof,
}: {
  score: number;
  tier: { label: string; tone: Tone };
  fresh: number;
  proof: number;
}) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <span className={`text-2xl font-bold ${tier.tone === "pos" ? "text-emerald-400" : tier.tone === "neg" ? "text-red-400" : "text-zinc-300"}`}>
          {score.toFixed(0)}
        </span>
        <span className="text-xs text-zinc-500">/100</span>
        <InfoTip term="idea-score" />
      </div>
      <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[10px] ${toneClass(tier.tone)}`}>
        {tier.label}
      </span>
      <div className="mt-1 flex gap-2 text-[10px] text-zinc-500">
        <span title="Fresh signals">now {fresh.toFixed(0)}</span>
        <span title="Backtested proof">proof {proof.toFixed(0)}</span>
      </div>
    </div>
  );
}

function Stat({ label, term, value }: { label: string; term: string; value: string }) {
  return (
    <span className="inline-flex items-center">
      <span className="text-zinc-500">{label}:</span>
      <span className="ml-1 text-zinc-300">{value}</span>
      <InfoTip term={term} />
    </span>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: Tone }) {
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
