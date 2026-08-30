# StockWallet — Phased Build Plan

**Owner:** Jaime · **Built with:** Po 🐼 · **Started:** 2026-08-29

A personal portfolio tracker + decision journal for a real, active trader. Goal isn't
to "predict the market" — it's to give Jaime an accurate record of what he holds, why
he bought it, and whether his reasoning actually worked. Discipline over magic.

> ⚠️ Not financial advice. Tools for tracking and reflection only.

---

## Guiding Principles
- **Accuracy first.** Transaction-based ledger (buys/sells + fees) → correct cost basis & P/L. Never eyeball.
- **Ship in slices.** Every phase deploys and is usable on its own.
- **$0 stack.** Free tiers only unless Jaime explicitly approves spend.
- **Private.** Real financial data → locked behind auth, only Jaime gets in.
- **Build the loop that makes him a better trader**, not just a prettier ticker.

## Recommended Stack
- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind
- **Hosting:** Vercel (already connected ✅)
- **DB:** Neon Postgres (free) via Prisma ORM  ·  *alt: Supabase if we want built-in auth*
- **Auth:** Custom single-user — username + password + **TOTP 2FA** (authenticator app, QR enrollment). jose JWT cookie sessions, bcrypt, otplib. *(Replaced the original GitHub-OAuth plan.)*
- **Market data:** Finnhub free tier for US quotes  ·  *alt: Twelve Data / Polygon*
- **Delivery style:** PWA (installable on desktop + phone, feels like a widget)

---

## Phase 0 — Foundation & Pipeline  *(prove it works end-to-end)*
**Goal:** A live, deployed, empty-but-real app on the internet, locked to Jaime.
- Scaffold Next.js + TS + Tailwind in `Projects/StockWallet`
- Create GitHub repo, push, connect to Vercel → auto-deploy on push
- Add Neon Postgres + Prisma, run first migration
- NextAuth GitHub login — only Jaime can enter
- **Done when:** live URL loads, Jaime logs in, DB connected.

## Phase 1 — Portfolio Core  *(the MVP)*  🏗️ in progress
**Goal:** Enter real trades, see accurate holdings & P/L.
- Data model: `Account`, `Transaction` (ticker, side, qty, price, fees, date), derived `Position`
- Manual trade entry (buy/sell) + edit/delete
- Cost-basis engine (average cost to start; FIFO later)
- Live quotes from Finnhub → current value, unrealized gain/loss per position + total
- Dashboard: total value, total P/L (realized + unrealized), positions table
- **Done when:** Jaime enters his real trades and the numbers match his brokerage.

## Phase 2 — Watchlist & Quotes Polish
**Goal:** Track tickers he's eyeing without owning them.
- Watchlist CRUD, live quotes, day change %, mini sparkline
- Quote caching layer to respect Finnhub rate limits
- Market-hours awareness (open/closed indicator)
- **Done when:** watchlist updates smoothly and stays within API limits.

## Phase 3 — Bet Journal 🎯  *(the differentiator)*
**Goal:** Turn trades into a feedback loop.
- Log a thesis per trade/idea: reasoning, target price, timeframe, conviction level
- Link to a position or stand alone (a "watch this play out" idea)
- Review view: was the target hit? was the thesis right?
- Stats: win rate, avg return on convicted ideas, best/worst calls
- **Done when:** Jaime can look back and see which of his reasons actually worked.

## Phase 4 — Alerts & Notifications
**Goal:** Get pinged on the moves that matter.
- Price-target alerts (above/below), % move alerts
- Scheduled checks (Vercel Cron, or Po pings via OpenClaw)
- Delivery: email and/or push (and I can tell you directly)
- **Done when:** setting a target reliably notifies Jaime when it triggers.

## Phase 5 — Analytics & Insight  *(clearly "not advice")*
**Goal:** See the shape of the portfolio and spot setups yourself.
- Allocation by sector / asset, concentration warnings
- Performance over time (daily portfolio snapshots → equity curve)
- Optional indicators (SMA/EMA, RSI) on charts — labeled tools, not signals
- Realized vs unrealized breakdown, dividend tracking
- **Done when:** the dashboard tells a clear story of how the portfolio is doing.

## Phase 6 — Polish, PWA & Optional Desktop Widget
**Goal:** Make it feel like a product.
- Full PWA: installable, offline shell, clean mobile layout
- Dark mode, keyboard-fast trade entry
- CSV import/export of trades (portability + backup)
- *Optional:* lightweight always-on desktop ticker
- **Done when:** it's something you're proud to pin and show off.

---

## Cross-Cutting (every phase)
- Security: auth on everything, secrets in Cred Manager, no keys in repo
- Backups: trade data exportable to CSV
- Disclaimers: "not financial advice" where it counts
- Tests on the money math (cost basis / P/L) — that's the part that must never be wrong

## Open Decisions
- [ ] DB: Neon Postgres (recommended) vs Supabase
- [ ] Cost basis method: average (simpler) vs FIFO (tax-accurate) — start average, add FIFO later
- [ ] Which brokerage(s) Jaime uses (helps match numbers + future CSV import format)

## Progress Log
- 2026-08-29 — Plan drafted. Greenlit: Neon (free), average-cost basis, Robinhood.
- 2026-08-29 — **Phase 0 (mostly done):** scaffolded Next.js+TS+Tailwind (App Router); GitHub repo `xKAMALEONx/stockwallet` (private); deployed to Vercel prod (project `po-1ed7/stockwallet`), live + HTTP 200.
  - TODO (Jaime, dashboard): (1) add **Neon Postgres** via Storage tab; (2) authorize **Vercel GitHub app** to enable push-to-deploy (`vercel git connect` currently fails until then).
  - TODO (Po, next): Prisma setup + first migration; NextAuth GitHub login.
- 2026-08-29 — **Phase 0 pipeline COMPLETE:** Neon attached (all `POSTGRES_*`/`DATABASE_URL` env vars injected); Vercel↔GitHub connected → **push-to-deploy verified** (push → new prod deploy in ~26s; `stockwallet-git-main` alias present).
  - Clean prod URL: **https://stockwallet-po-1ed7.vercel.app** (currently behind Vercel Deployment Protection → shows Vercel login to anonymous visitors; Jaime can view logged-in. Decide later: keep protection vs rely on our own NextAuth.)
  - Remaining Phase 0 dev work (Po): Prisma init against Neon + first migration; NextAuth GitHub login.
- 2026-08-29 — **Prisma + Auth wired:** Prisma **6.19.3** (pinned; Prisma 7 dropped schema `url`/`directUrl`), first migration `init_auth` applied to Neon (User/Account/Session/VerificationToken). NextAuth v5 (`next-auth@5 beta`) + `@auth/prisma-adapter`, GitHub provider, **locked to GitHub login `xKAMALEONx` only**. `AUTH_SECRET` set on Vercel (all envs). Session-aware landing page w/ Sign in / Sign out. Local build ✓, deployed ● Ready.
  - **BLOCKER for login (Jaime):** create a GitHub **OAuth App** → store Client ID + Secret in Cred Manager → Po sets `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` on Vercel + local, redeploys, tests sign-in. Until then the button renders but can't complete.
- 2026-08-30 — **Auth pivot (GitHub OAuth → username/password + TOTP 2FA).** GitHub OAuth callback was breaking behind Vercel Deployment Protection; Jaime chose to drop OAuth for a self-contained login. Actions taken:
  - **Disabled Vercel Deployment Protection** (`ssoProtection = null`) — our own auth is now the sole gate. App URL reachable; every route still requires login.
  - Removed NextAuth + `@auth/prisma-adapter`. New stack: **jose** (JWT cookie sessions, edge-safe), **bcryptjs** (password hash), **otplib@12** (TOTP), **qrcode** (enrollment QR). Middleware guards all routes except `/login` `/setup`.
  - New migration `switch_to_credentials_auth` (dropped OAuth tables, reshaped `User`: username/passwordHash/totpSecret/totpEnabled). Applied via hand-written SQL + `migrate deploy` (Prisma 6 blocks `migrate reset`/`migrate dev` for AI agents / non-interactive).
  - `build` script now runs `prisma generate && next build` (ensures client on Vercel). Local build ✓; deployed ● Ready; verified `/setup` renders (Prisma↔Neon works in prod) and `/` redirects to login.
  - **LAST STEP (Jaime):** open the site → **/setup** → create username+password → scan QR into authenticator → enter code → you're in. That closes Phase 0.
  - Tech debt: Next 16 deprecated `middleware` file → migrate to `proxy` convention later (non-blocking).
- 2026-08-30 — **Phase 0 CLOSED.** Jaime enrolled at /setup (username+password+TOTP) and logged in. Foundation complete.
- 2026-08-30 — **Phase 1 core built + deployed.** Migration `add_portfolio` (Account, Transaction, TradeSide enum). Average-cost **engine** `src/lib/portfolio.ts` (`computePositions`/`withQuotes`/`summarize`) with **10 vitest tests passing** (`src/lib/portfolio.test.ts`, `npm test`). Trade CRUD server actions (`src/app/portfolio-actions.ts`, ownership-scoped). Dashboard `src/app/page.tsx`: summary tiles, holdings table, add-trade form, transactions ledger w/ edit (`/trades/[id]/edit`) + delete. Finnhub quote fetcher `src/lib/quotes.ts` (dormant until `FINNHUB_API_KEY` set). Build ✓, deployed ● Ready, `/login` 200, `/` 307→login.
  - **Remaining for Phase 1 done:** (1) Jaime adds a **Finnhub** key (Cred Manager `StockWallet_Finnhub`) → Po wires `FINNHUB_API_KEY` → live market value + unrealized P/L. (2) Jaime enters real Robinhood trades and confirms numbers match brokerage.
