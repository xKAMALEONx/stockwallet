"use client";

// Dead-simple watchlist log: a ticker and a one-line note. No direction, no
// conviction, no target — just capture what you're keeping an eye on. Jaime's
// ask: "good word or something I see working out, nothing complex."

export default function WatchForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Ticker</span>
        <input
          name="symbol"
          placeholder="AAPL"
          required
          className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 uppercase text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-zinc-400">What caught your eye?</span>
        <input
          name="note"
          placeholder="Strong product cycle, cheap right now…"
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>
      <button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
        Add to watchlist
      </button>
    </form>
  );
}
