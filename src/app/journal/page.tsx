import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listJournal } from "@/lib/journal";
import { getQuoteData } from "@/lib/quotes";
import {
  createThesis,
  gradeThesis,
  reopenThesis,
  deleteThesis,
} from "@/app/journal-actions";
import { money, percent, pnlColor } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONV_LABEL = { LOW: "Low", MEDIUM: "Med", HIGH: "High" } as const;

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
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  // Stats: overall + by conviction (only graded/closed entries count).
  const graded = entries.filter((e) => e.verdict);
  const rights = graded.filter((e) => e.verdict === "RIGHT").length;
  const winRate = graded.length ? (rights / graded.length) * 100 : null;
  const byConv = (["HIGH", "MEDIUM", "LOW"] as const).map((c) => {
    const g = graded.filter((e) => e.conviction === c);
    const r = g.filter((e) => e.verdict === "RIGHT").length;
    return { c, total: g.length, rate: g.length ? (r / g.length) * 100 : null };
  });

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
          Log <span className="text-zinc-300">why</span> you make a move, then grade
          yourself when it plays out. The point is the feedback loop — find out which
          of your reasons actually work.
        </p>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Ideas logged" value={String(entries.length)} />
          <Tile
            label="Win rate"
            value={winRate == null ? "—" : `${winRate.toFixed(0)}%`}
            color={
              winRate == null
                ? "text-zinc-100"
                : winRate >= 50
                  ? "text-emerald-400"
                  : "text-red-400"
            }
          />
          {byConv
            .filter((b) => b.c !== "MEDIUM")
            .map((b) => (
              <Tile
                key={b.c}
                label={`${CONV_LABEL[b.c]}-conviction`}
                value={b.rate == null ? "—" : `${b.rate.toFixed(0)}%`}
                color={
                  b.rate == null
                    ? "text-zinc-100"
                    : b.rate >= 50
                      ? "text-emerald-400"
                      : "text-red-400"
                }
              />
            ))}
        </section>

        {/* Log a thesis */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Log a thesis</SectionTitle>
          {error && <ErrorNote>{error}</ErrorNote>}
          <form
            action={createThesis}
            className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-6"
          >
            <Input name="symbol" label="Ticker" placeholder="NVDA" required />
            <Select name="direction" label="Direction">
              <option value="BULL">Bullish</option>
              <option value="BEAR">Bearish</option>
            </Select>
            <Select name="conviction" label="Conviction" defaultValue="MEDIUM">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
            <Input name="targetPrice" label="Target $" type="number" step="any" placeholder="200" />
            <Input name="timeframe" label="By (date)" type="date" defaultValue={today} />
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
                Log
              </button>
            </div>
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
        </section>

        {/* Entries */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Your theses</SectionTitle>
          {entries.length === 0 ? (
            <Empty>No theses logged yet. Log your first one above.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((e) => {
                const price = quoteData[e.symbol]?.price ?? null;
                const target = e.targetPrice ? e.targetPrice.toNumber() : null;
                const entry = e.entryPrice ? e.entryPrice.toNumber() : null;
                const targetHit =
                  target != null && price != null
                    ? e.direction === "BULL"
                      ? price >= target
                      : price <= target
                    : null;
                const expired = e.timeframe
                  ? now > new Date(e.timeframe).getTime()
                  : false;
                const movePct =
                  entry != null && price != null && entry !== 0
                    ? ((price - entry) / entry) * 100
                    : null;

                return (
                  <div
                    key={e.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
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
                        {e.status === "CLOSED" && e.verdict && (
                          <Chip
                            tone={e.verdict === "RIGHT" ? "pos" : "neg"}
                          >
                            {e.verdict === "RIGHT" ? "✓ Right" : "✗ Wrong"}
                          </Chip>
                        )}
                      </div>
                      <span className="text-xs text-zinc-600">
                        {e.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-zinc-300">{e.thesis}</p>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
                      {entry != null && <span>Logged at {money(entry)}</span>}
                      {price != null && (
                        <span>
                          Now {money(price)}{" "}
                          {movePct != null && (
                            <span className={pnlColor(movePct)}>
                              ({percent(movePct)})
                            </span>
                          )}
                        </span>
                      )}
                      {target != null && (
                        <span>
                          Target {money(target)}{" "}
                          {targetHit === true && (
                            <span className="text-emerald-400">✓ hit</span>
                          )}
                          {targetHit === false && (
                            <span className="text-zinc-500">not yet</span>
                          )}
                        </span>
                      )}
                      {e.timeframe && (
                        <span className={expired ? "text-amber-400" : ""}>
                          By {new Date(e.timeframe).toISOString().slice(0, 10)}
                          {expired ? " (expired)" : ""}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex gap-3 text-xs">
                      {e.status === "OPEN" ? (
                        <>
                          <GradeButton id={e.id} verdict="RIGHT" label="✓ Right" tone="pos" />
                          <GradeButton id={e.id} verdict="WRONG" label="✗ Wrong" tone="neg" />
                        </>
                      ) : (
                        <form action={reopenThesis}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="text-zinc-400 underline hover:text-zinc-200">
                            Reopen
                          </button>
                        </form>
                      )}
                      <form action={deleteThesis}>
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

function GradeButton({
  id,
  verdict,
  label,
  tone,
}: {
  id: string;
  verdict: "RIGHT" | "WRONG";
  label: string;
  tone: "pos" | "neg";
}) {
  return (
    <form action={gradeThesis}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="verdict" value={verdict} />
      <button
        className={`rounded-md border px-2.5 py-1 font-medium ${
          tone === "pos"
            ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
            : "border-red-900 bg-red-950/40 text-red-300 hover:bg-red-900/40"
        }`}
      >
        {label}
      </button>
    </form>
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

function Select({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <select
        {...props}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
      >
        {children}
      </select>
    </label>
  );
}
