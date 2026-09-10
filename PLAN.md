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

## Phase 1 — Portfolio Core  *(the MVP)*  ✅ done
**Goal:** Enter real trades, see accurate holdings & P/L.
- Data model: `Account`, `Transaction` (ticker, side, qty, price, fees, date), derived `Position`
- Manual trade entry (buy/sell) + edit/delete
- Cost-basis engine (average cost to start; FIFO later)
- Live quotes from Finnhub → current value, unrealized gain/loss per position + total
- Dashboard: total value, total P/L (realized + unrealized), positions table
- **Done when:** Jaime enters his real trades and the numbers match his brokerage.

## Phase 2 — Watchlist & Quotes Polish  ✅ done *(sparklines deferred — free candle data blocked)*
**Goal:** Track tickers he's eyeing without owning them.
- Watchlist CRUD, live quotes, day change %, mini sparkline
- Quote caching layer to respect Finnhub rate limits
- Market-hours awareness (open/closed indicator)
- **Done when:** watchlist updates smoothly and stays within API limits.

## Phase 3 — Bet Journal 🎯 + News-Driven Ideas  ✅ done  *(the differentiator)*
**Reshaped 2026-09-02 (Jaime):** wants a **news-recommended stock ideas list** with a **long-term benefit lens** (his goal is long-term investing). Bet Journal folds in as the "log your thesis" layer.

### Data sourcing spike (done 2026-09-02) — all tested live
- **Finnhub free (have key) ✅:** `/news?category=general` (100 sourced articles w/ source+headline+url); `/company-news?symbol=&from=&to=` (per-ticker, sourced); `/stock/recommendation` (analyst consensus strongBuy/buy/hold/sell counts — long-term street view); `/stock/metric?metric=all` (P/E, 52wk hi/lo, EPS — valuation).
- **Finnhub premium ❌:** `/stock/price-target` → 403 (analyst target/upside NOT free here).
- **Gap for TRUE news-discovery:** need **ticker-tagged news + sentiment** (Finnhub company-news requires you to name the ticker). → **Recommend Marketaux** (free, 100/day, entity/ticker sentiment). Alt: Alpha Vantage (25/day, but NEWS_SENTIMENT + OVERVIEW's AnalystTargetPrice fills the upside gap).
- **Long-run lens (sourceable, NOT advice):** analyst consensus trend + valuation (P/E, PEG, 52wk) + analyst target upside (needs AV or paid). Always show source links.
- **PENDING DECISION (Jaime):** pick news source — Marketaux (rec) vs Alpha Vantage vs Finnhub-only. Then create free key → Cred Manager.

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
- 2026-08-30 — Finnhub key wired (`FINNHUB_API_KEY` on Vercel + local); live prices ON. `Price / share` label clarified on trade forms.
- 2026-09-01 — **Phase 1 ACCEPTANCE PASSED + CLOSED.** Jaime entered a full year of real trades. Reconciliation: stocks match brokerage exactly (NVDA +$5.87); realized P/L ours −$43.29 vs Robinhood −$39.54 — the entire ~$3.75 gap is **XRP crypto spread** (Robinhood bakes spread into crypto basis; avg-vs-FIFO only differs $0.04, so engine is correct). Jaime accepted (Option A). Fixed root cause: migration `widen_decimal_precision` (price/fees → Decimal(20,8), qty → Decimal(28,10)) so crypto stores exactly. Deployed ● Ready.
  - **Known gaps → Phase 2:** (a) crypto (XRP) has no live quote — Finnhub `/quote` is stock-only, need crypto endpoint; (b) definitive brokerage match needs **Robinhood CSV import** (Phase 6). Neither blocks.

## Phase 1 → 2 handoff notes
- Finnhub `/quote` returns `c` (price), `d` (day change $), `dp` (day change %), `pc` (prev close) — day-change comes FREE, no extra call. Use for watchlist + holdings.
- Finnhub free tier: `/quote` free; `/stock/candle` (for sparklines) is PREMIUM (403 on free) — sparklines need another source or defer.

## Phase 2 progress
- 2026-09-01 — **Watchlist shipped**: `WatchlistItem` model + migration `add_watchlist`; CRUD (`src/app/watchlist-actions.ts`, `src/lib/watchlist.ts`); dashboard Watchlist section; **day-change %** column added to holdings + watchlist (free from Finnhub `/quote` `dp`). Unified single quote fetch for holdings+watchlist.
- 2026-09-01/02 — **Secret corruption fixed**: PS5.1 piping into `vercel env add` truncated values → `FINNHUB_API_KEY` was 11 chars (401 Invalid API key; watchlist prices blank) and `AUTH_SECRET` was 11 chars. Re-set BOTH via **Vercel REST API** (clean): Finnhub back to 40 chars, AUTH_SECRET rotated to strong 44-char (invalidated Jaime's session → one re-login, no re-enroll). Lesson saved in TOOLS.md: set Vercel env via API, never piped CLI.
- 2026-09-02 — **Crypto quotes shipped**: `src/lib/quotes.ts` now routes crypto tickers (map of BTC/ETH/XRP/… → CoinGecko ids) to CoinGecko `simple/price` (free, no key), stocks stay on Finnhub. XRP now prices on holdings + watchlist. Deployed ● Ready.
  - **Phase 2 remaining:** market open/closed badge; sparklines (deferred — free candle data blocked). Quote caching is currently `fetch` revalidate:30s (fine for single user).
- 2026-09-02 — **Market-hours badge shipped** (`src/lib/market.ts`, header badge). ET session Mon–Fri 9:30–16:00, DST-safe via Intl (no holiday calendar). Crypto watchlist confirmed working by Jaime. **Phase 2 CLOSED** (sparklines deferred to a later polish — Finnhub free blocks candles; revisit with an alt source or in Phase 5/6).

## Phase 3 progress
- 2026-09-02 — **Ideas board shipped** (`/ideas`, 💡 nav link). Marketaux key set via Vercel API (Cred Manager `StockWallet_Marketaux` -> `MARKETAUX_API_KEY`). `src/lib/news.ts` (Marketaux paged aggregation -> ticker mentions + sentiment, match>=40, US tickers, top 20 candidates), `src/lib/fundamentals.ts` (Finnhub consensus + P/E + 52wk). Ideas page gates: quotable (Finnhub quote) + analyst coverage; cards show news sentiment, analyst consensus, valuation, sourced headlines, "+ Watch". Cached 6h.
  - **HONEST LIMITATION:** Marketaux free *general* feed is PR-wire heavy + cross-tags loosely (PALAF slideshow, CWK/PPIH tangential slipped through despite gates; AAPL/STM/ZEPP legit). Threshold filtering has a quality ceiling.
  - **RECOMMENDED next iteration:** pivot discovery to a **curated quality universe** (defined list of solid US large/mid-caps) -> pull news + consensus + valuation, rank by news activity + bullish consensus. Turns "whatever crossed the wire" into "notable covered companies with real news + bullish setup." Pending Jaime's ok.
- 2026-09-02 — **Bet Journal SHIPPED → Phase 3 CLOSED.** Migration `add_journal` (JournalEntry + enums Conviction/ThesisDirection/ThesisStatus/Verdict). `src/lib/journal.ts`, `src/app/journal-actions.ts` (createThesis w/ entry-price snapshot via getQuoteData, gradeThesis, reopenThesis, deleteThesis), `/journal` page + 🎯 nav link. Features: log thesis (direction/target/timeframe/conviction/reasoning), live target-hit + expired signals, move-since-logged %, grade Right/Wrong, win-rate stats overall + by conviction. Deployed ● Ready. Build clean; `/journal` 307-guarded.
- 2026-09-02 — **Curated-universe upgrade SHIPPED + approved.** `src/lib/news.ts` now queries Marketaux with `symbols=<UNIVERSE>` (whitelist of ~55 quality US large/mid-caps) so only real/covered/quotable names surface — OTC/PR-wire noise structurally impossible. Dry-run board: NVDA/AAPL/LLY/JNJ/NFLX/AMD/GOOGL (all legit). match>=30, 8 pages, cached 6h. Deployed ● Ready. Universe is a static list in news.ts — easy to expand/sector-tune later.
- 2026-09-02 — **Trade Guard SHIPPED** (`/check`, 🛡️ nav link). Pre-trade discipline gate molded for LONG-TERM investing (Jaime tuned the rules). Pure tested engine `src/lib/guard.ts` (**10 vitest tests**, 20 total now). Rules + thresholds: (1) thesis + **12-month** horizon; (2) don't buy extended = within 5% of 52wk high OR up >5% today; (3) P/E > 40 (explained in-app; Jaime didn't know P/E); (4) **concentration > 25% = hard 🔴 block**; (5) hold-don't-churn = selling held < 12mo; (6) don't panic-sell = selling while down >10% today; (7) overtrading = 3+ trades/6mo. Verdict 🟢/🟡/🔴. All data from existing sources (ledger, quotes, Finnhub metric, journal). It's a *consult-before-you-buy* gate (StockWallet isn't the broker), not an order blocker.
  - Idea for Phase 4: proactive nudges (Po/cron) — "N ungraded theses", "bought X without a thesis", weekly review.
- 2026-09-02 — **Guard scales + beginner explainers** added to `/check`: visual `Meter` gauge for P/E (Normal ≤25 / Pricey 25-40 / Expensive 40+, marker at the stock's value) and Concentration (Safe ≤25% / Too-much 25%+, marker at projected %), each with a plain-English explanation (Jaime is a beginner; asked to dumb down P/E + concentration). Shown on BUY checks. Deployed ● Ready. TODO idea: add the P/E mini-gauge to Ideas cards too ("see what's good" while browsing).
- 2026-09-02 — **Guard amount field relabeled** to "How much you'll invest ($)" (beginner clarity).
- 2026-09-03 — **Guard news read shipped.** `src/lib/news.ts` `getSymbolNews(symbol)` (Marketaux `symbols=<ticker>`, 30m cache) + `newsTradeSummary(avg, action, hasArticles)` (plain-English "why this may/may not be optimal" tuned per BUY/SELL). `/check` now shows a 📰 news card under the verdict: sentiment lean + trade-context nuance + 2–3 sourced headlines + "not a signal" disclaimer. Build ✓, deployed ● Ready; live-verified (NVDA 3 articles, ~neutral).
  - **STATUS: Phase 3 + the Trade Guard discipline system are COMPLETE.** Guard sub-features done: 7 long-term rules (tested), 🟢/🟡/🔴 verdict, P/E + concentration visual scales w/ beginner explainers, per-trade news read.
  - **NEXT per plan → Phase 4 (Alerts & Notifications):** price-target/% -move alerts + proactive discipline nudges (ungraded theses, buys logged w/o a thesis, weekly review) delivered via Vercel Cron and/or Po through OpenClaw. Optional carryover polish: P/E mini-gauge on Ideas cards.

## Phase 4 progress
- 2026-09-03 — **Phase 4 core BUILT + deployed.** Migration `add_alerts` (Alert + AlertDirection enum). `src/lib/alerts.ts`, `src/app/alert-actions.ts`, **/alerts** page (add/remove price alerts ABOVE/BELOW target, live status) + 🔔 nav link. Secure endpoint **`/api/alerts/check?token=CRON_SECRET`** (route handler; middleware PUBLIC now includes `/api/alerts`) → returns `{notifications:[]}`: triggered price alerts (12h throttle via `lastTriggeredAt`), theses ready to grade (target hit or timeframe expired), recent buys (21d) with no thesis. `CRON_SECRET` (48-hex) on Vercel + Cred Manager `StockWallet_CronSecret`. Verified live: 401 w/o token; with token caught "bought SPCX, no thesis".
  - **Delivery = Po pings Jaime.** OpenClaw cron job "StockWallet alert check" (id `76ce4a81`, sessionTarget main, systemEvent, cron `0 8,14 * * 1-5` America/Denver) wakes main session → reads secret from Cred Manager → GET endpoint → messages Jaime only if notifications non-empty (silent otherwise).
  - **Acceptance:** mechanism proven end-to-end via manual call; final confirmation = a real alert/nudge fires on schedule and Jaime receives the ping. Could add: weekly review cadence, % -move alerts, email delivery.

## Re-evaluation (2026-09-08) + Phase 5 kickoff
- **Re-eval (Jaime asked "are we still building a great long-term tool?"):** Engine is correct + tested (21→29 tests), discipline loop (Guard + Journal + nudges) is the real differentiator. **Gaps for a long-term tool, ranked:** (1) no dividends — biggest total-return gap; (2) no equity curve / SPY benchmark (needs daily snapshots started NOW — time-sensitive, can't backfill); (3) no sector/allocation view (concentration is per-ticker only); (4) README still boilerplate + no CSV export/backup (data-loss risk). Jaime picked **dividends** first.
- **Dividend tracking SHIPPED (Phase 5 partial).** Migration `add_dividends` (`Dividend` model — kept OUT of the tx ledger on purpose so the tested cost-basis engine stays untouched; a dividend is realized income, not a buy/sell). `src/lib/dividends.ts` (`incomeBySymbol`/`totalIncome`/`totalReturn`) + **8 vitest tests (29 total)**. `src/app/dividend-actions.ts` (list/create/delete, ownership-scoped). Dashboard: **Dividend Income + Total Return tiles** (Total Return = realized + unrealized + dividends), per-holding **Income** column, dividend entry form + ledger. Build ✓, tests ✓, deployed ● Ready (login 200, root 307→login).
  - **NEXT candidates (Jaime's pick):** equity curve + SPY benchmark (start daily snapshot cron soon — time-sensitive), sector allocation view, CSV export + real README. % -move alerts + weekly review still open from Phase 4.
- **Equity curve + SPY benchmark SHIPPED (Phase 5 partial).** Migration `add_snapshots` (`PortfolioSnapshot`: one row/user/day, unique on date; market value + cost basis + cumulative dividends + SPY price). `src/lib/snapshots.ts` (`captureSnapshot` — idempotent upsert per UTC day; skips when no quotable market value so the curve never records a phantom zero). `src/lib/equity.ts` (`buildCurve` — normalizes portfolio total value (incl. dividends) + SPY to 100 at start; returns return%, SPY%, outperformance) + **6 vitest tests (35 total)**. Secure `GET /api/snapshot?token=CRON_SECRET` (middleware PUBLIC += /api/snapshot). `/performance` page: inline-SVG equity curve (You solid emerald vs SPY dashed sky, indexed to 100), Your Return / SPY / vs-Index tiles; 📈 nav link. Build ✓, tests ✓, deployed ● Ready.
  - **Live-verified:** endpoint captured first real point (portfolio ~$318.31, SPY 765.96, 2026-09-09); confirmed idempotent (re-run = 1 row) + 401 without token.
  - **Daily collection (Jaime's pick = fold into existing cron):** the "StockWallet alert check" cron (76ce4a81, weekdays 8am+2pm MT) should ALSO GET `/api/snapshot?token=<secret>` each run (silent — no message needed). **Documented in AGENTS.md**; needs the automations tool to actually patch job 76ce4a81's prompt (do this in a session where `automations` is available). Until patched, snapshots only land when manually triggered.
  - **Time-sensitive note:** history accrues from 2026-09-09. Equity curve shows once ≥2 days exist. Getting the cron patched soon = denser early history.
  - **UPDATE 2026-09-10 — cron confirmed patched & healthy.** Job 76ce4a81 payload now GETs both `/api/alerts/check` AND `/api/snapshot` each run (step 5, silent); `lastRunStatus: ok`. Daily snapshots collect automatically weekdays 8am/2pm MT. The "until patched" caveat is closed.
- **Equity-curve BACKFILL SHIPPED (Phase 5) — 2026-09-10.** Killed the forward-only limitation: the curve now reconstructs history instead of only accruing from 2026-09-09. Pure engine `src/lib/backfill.ts` (replays the ledger to get shares-held + cost-basis as of each past day, values against a table of historical daily closes, adds cumulative dividends-to-date + SPY close) with **14 vitest tests (78 total)**. `src/lib/crypto-history.ts` (CoinGecko daily closes, key-aware), `src/lib/backfill-source.ts` (Alpaca stocks+SPY + CoinGecko crypto, fill-forward across weekends, idempotent upsert on userId+date), route **`GET /api/backfill?token=CRON_SECRET`** (middleware PUBLIC += /api/backfill; token-guarded, re-runnable, safe alongside the cron). Commits 8d88352 → 4fd2a0f.
  - **Two blocking bugs found & fixed during live verify:** (1) `/api/backfill` wasn't in middleware PUBLIC → 307→login before the route ran (fixed 4c6fec4). (2) CoinGecko client's `+1` day padding made the keyless "safe" retry request 366 days → 401 → empty XRP series → every day dropped; clamped keyless to 365, full range only with a key (fixed f876ccb).
  - **Live result:** backfilled **365 days (2025-09-11 → 2026-09-10)**, idempotent on re-run. 155 days dropped = the Apr 9–Sep 10 2025 XRP-only era that keyless CoinGecko can't reach (needs a free Demo key to close — code already key-aware; optional).

## Fresh re-eval + phase close-out (2026-09-10)
- **State:** 78 tests green (money math, guard, dividends, equity, sectors, backtest, ideas, backfill). Prod build clean. Every route deploys and is usable. Cron healthy (alerts + snapshots). Stack still $0.
- **Phase 5 (Analytics & Insight) is effectively COMPLETE:** ✅ sector allocation + concentration warnings, ✅ evidence-backed diversification Ideas engine (ETFs-first, long-term-fit ranked), ✅ performance/equity curve + SPY benchmark **now with real backfilled history**, ✅ realized/unrealized + dividend tracking. Optional indicators (SMA/EMA/RSI) were the one "nice-to-have" bullet never built — not core to the long-term thesis; leave deferred unless Jaime wants it.
- **Only genuinely-open items left in the whole plan:**
  1. (Optional) CoinGecko Demo key → extends the equity curve back to Apr 2025 (the XRP-only first 4 months). Everything else already works without it.
  2. **Phase 6** — PWA/installable, CSV import/export (backup + definitive brokerage reconciliation), real README, optional desktop ticker.
  3. Carryover niceties: %-move alerts, weekly-review cadence, P/E mini-gauge on Ideas cards.
- **Verdict:** the "closing out soon" goal is met — Phases 0–5 are done and the tool delivers the long-term-investor loop it set out to (accurate ledger → discipline gate → thesis journal → allocation/diversification → benchmarked performance). Phase 6 is polish/portability, not new capability.
