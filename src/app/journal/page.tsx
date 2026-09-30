import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import InfoTip from "@/app/components/InfoTip";
import { getSession } from "@/lib/session";
import { listJournal } from "@/lib/journal";
import { getQuoteData } from "@/lib/quotes";
import { logWatch, logProjection, deleteEntry } from "@/app/journal-actions";
import { gradePace, type PaceGrade } from "@/lib/pace";
import { money, percent, pnlColor } from "@/lib/format";
import WatchForm from "./watch-form";
import ProjectionForm from "./projection-form";

export const dynamic = "force-dynamic";

const CONV_LABEL = { LOW: "Low", MEDIUM: "Med", HIGH: "High" } as const;

const GRADE_TONE: Record<PaceGrade, string> = {
  AHEAD: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  HIT: "border-emerald-700 bg-emerald-900/50 text-emerald-200",
  ON_TRACK: "border-sky-800 bg-sky-950/40 text-sky-300",
  BEHIND: "border-amber-800 bg-amber-950/40 text-amber-300",
  UNKNOWN: "border-zinc-700 bg-zinc-900 text-zinc-400",
};
const GRADE_LABEL: Record<PaceGrade, string> = {
  AHEAD: "Ahead",
  HIT: "🎯 Hit",
  ON_TRACK: "On track",
  BEHIND: "Behind",
  UNKNOWN: "—",
};

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const entries = await listJournal(session.sub);
  const quoteData = await getQuoteData(entries.map((e) => e.symbol));
  const now = new Date();

  const watches = entries.filter((e) => e.kind === "WATCH");
  const projections = entries.filter((e) => e.kind === "PROJECTION");

  // Auto-grade every projection off live quotes (no manual right/wrong).
  const graded = projections.map((e) => {
    const price = quoteData[e.symbol]?.price ?? null;
    const pace = gradePace({
      entryPrice: e.entryPrice ? e.entryPrice.toNumber() : null,
      targetPrice: e.targetPrice ? e.targetPrice.toNumber() : null,
      currentPrice: price,
      horizonYears: e.horizonYears ?? null,
      loggedAt: e.createdAt,
      now,
      direction: e.direction,
    });
    return { e, price, pace };
  });

  // Scoreboard: how the tracked picks are pacing right now.
  const scored = graded.filter((g) => g.pace.grade !== "UNKNOWN");
  const winning = scored.filter(
    (g) => g.pace.grade === "AHEAD" || g.pace.grade === "HIT" || g.pace.grade === "ON_TRACK",
  ).length;
  const onTrackPct = scored.length ? (winning / scored.length) * 100 : null;
  const avgReturn = (() => {
    const vals = graded
      .map((g) => g.pace.returnPct)
      .filter((n): n is number => n != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();

  return (
    <div className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Bet Journal 🎯</h1>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Dashboard
          </Link>
        </header>

        <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-500">
          Two lists. A <span className="text-zinc-300">watchlist</span> for stocks you&apos;re
          eyeing, and <span className="text-zinc-300">projections</span> — pick a ticker and a
          horizon, get a target, and let the system grade the pick against that plan on its own.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Scoreboard */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Watching" term="ideas-logged" value={String(watches.length)} />
          <Tile label="Projections" value={String(projections.length)} />
          <Tile
            label="On-track"
            term="win-rate"
            value={onTrackPct == null ? "—" : `${onTrackPct.toFixed(0)}%`}
            color={
              onTrackPct == null
                ? "text-zinc-100"
                : onTrackPct >= 50
                  ? "text-emerald-400"
                  : "text-amber-400"
            }
          />
          <Tile
            label="Avg return"
            value={avgReturn == null ? "—" : percent(avgReturn)}
            color={avgReturn == null ? "text-zinc-100" : pnlColor(avgReturn)}
          />
        </section>

        {/* ── Projections ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Project a pick</SectionTitle>
          <ProjectionForm action={logProjection} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle>Tracked picks</SectionTitle>
          {graded.length === 0 ? (
            <Empty>No projections yet. Analyze a ticker above and track it.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {graded.map(({ e, price, pace }) => {
                const entry = e.entryPrice ? e.entryPrice.toNumber() : null;
                const target = e.targetPrice ? e.targetPrice.toNumber() : null;
                return (
                  <div
                    key={e.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-emerald-400">
                          {e.symbol}
                        </span>
                        <span
                          className={
                            e.direction === "BULL"
                              ? "text-xs text-emerald-400"
                              : "text-xs text-red-400"
                          }
                        >
                          {e.direction === "BULL" ? "▲ Bullish" : "▼ Bearish"}
                        </span>
                        <Chip>{CONV_LABEL[e.conviction]} conviction</Chip>
                        {e.horizonYears != null && (
                          <Chip>{e.horizonYears}yr horizon</Chip>
                        )}
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${GRADE_TONE[pace.grade]}`}
                        >
                          {GRADE_LABEL[pace.grade]}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-600">
                        {e.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </div>

                    {e.note && (
                      <p className="mt-2 text-sm text-zinc-300">{e.note}</p>
                    )}

                    {/* Live auto-grade line */}
                    <p className="mt-2 text-xs text-zinc-400">{pace.note}</p>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
                      {entry != null && <span>Logged at {money(entry)}</span>}
                      {price != null && (
                        <span>
                          Now {money(price)}{" "}
                          {pace.returnPct != null && (
                            <span className={pnlColor(pace.returnPct)}>
                              ({percent(pace.returnPct)})
                            </span>
                          )}
                        </span>
                      )}
                      {target != null && <span>Target {money(target)}</span>}
                      {pace.expectedPrice != null && pace.grade !== "HIT" && (
                        <span>On-pace {money(pace.expectedPrice)}</span>
                      )}
                    </div>

                    <div className="mt-3 flex gap-3 text-xs">
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-red-400 underline hover:text-red-300">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Watchlist ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Add to watchlist</SectionTitle>
          <WatchForm action={logWatch} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle>Watching</SectionTitle>
          {watches.length === 0 ? (
            <Empty>Nothing on the watchlist yet. Jot down what you&apos;re eyeing.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {watches.map((e) => {
                const price = quoteData[e.symbol]?.price ?? null;
                const entry = e.entryPrice ? e.entryPrice.toNumber() : null;
                const drift =
                  entry != null && price != null && entry !== 0
                    ? ((price - entry) / entry) * 100
                    : null;
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="font-bold text-emerald-400">{e.symbol}</span>
                      <span className="truncate text-sm text-zinc-300">{e.note}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      {entry != null && <span>Flagged {money(entry)}</span>}
                      {drift != null && (
                        <span className={pnlColor(drift)}>{percent(drift)}</span>
                      )}
                      <span className="text-zinc-600">
                        {e.createdAt.toISOString().slice(0, 10)}
                      </span>
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-red-400 underline hover:text-red-300">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  color = "text-zinc-100",
  term,
}: {
  label: string;
  value: string;
  color?: string;
  term?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="flex items-center text-xs uppercase tracking-wide text-zinc-500">
        {label}
        {term && <InfoTip term={term} />}
      </p>
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

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "pos" | "neg" | "neutral";
}) {
  const cls =
    tone === "pos"
      ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
      : tone === "neg"
        ? "border-red-900 bg-red-950/40 text-red-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}
