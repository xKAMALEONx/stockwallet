export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-24 font-sans text-zinc-100">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium uppercase tracking-widest text-emerald-400">
            Portfolio · Journal · Discipline
          </span>
          <h1 className="text-5xl font-bold tracking-tight">
            Stock<span className="text-emerald-400">Wallet</span>
          </h1>
          <p className="max-w-lg text-lg leading-8 text-zinc-400">
            An honest record of what you hold, why you bought it, and whether your
            reasoning actually worked. Built for real trading, not guessing.
          </p>
        </div>

        <ol className="flex flex-col gap-3 text-sm">
          {[
            ["Phase 0", "Foundation & pipeline", true],
            ["Phase 1", "Portfolio core — real trades, real P/L", false],
            ["Phase 2", "Watchlist & live quotes", false],
            ["Phase 3", "Bet journal — track your thesis", false],
          ].map(([phase, label, done]) => (
            <li
              key={phase as string}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  done ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span className="font-mono text-zinc-500">{phase}</span>
              <span className="text-zinc-300">{label}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-zinc-600">
          Not financial advice. A tracking and reflection tool.
        </p>
      </main>
    </div>
  );
}
