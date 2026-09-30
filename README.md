# StockWallet

A full-stack web app for tracking a personal stock portfolio — transactions, dividends, a watchlist, price alerts, and a trade journal — with daily performance benchmarked against the S&P 500. Built and deployed as a personal-use application.

**Live:** https://stockwallet-po-1ed7.vercel.app *(opens to a login wall — it uses real authentication with two-factor login)*

---

## What it does

- **Portfolio tracking** — Log buy/sell transactions and dividends; the app computes holdings, cost basis, and current value.
- **Watchlist & trade journal** — Keep an eye on tickers you don't own yet and write notes on the trades you do make.
- **Price alerts** — Set thresholds and get notified when a stock crosses them.
- **Performance vs. the market** — A daily snapshot job records portfolio value and charts it against the S&P 500 over time.
- **Allocation & ideas views** — See how the portfolio is split and surface potential ideas.

## Tech stack

| Layer | What I used |
|-------|-------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | Prisma ORM over a SQL database — 8 related data models |
| Auth | Passwords hashed with **bcryptjs**, signed session tokens with **jose** (JWT), two-factor login with **otplib** (TOTP) + **qrcode** for setup |
| Market data | External REST APIs pulled by scheduled backend jobs |
| Hosting | Vercel — separate production and preview environments, secured API keys |

## Notable engineering

- **Authentication built from scratch.** No auth library — I hashed passwords, signed and verified session tokens, and implemented time-based one-time-password (TOTP) two-factor login with QR-code enrollment.
- **Scheduled backend jobs.** Cron-triggered API routes pull live market data, evaluate price alerts, and snapshot daily portfolio value against the S&P 500 so performance can be charted over time.
- **Single relational schema.** Eight Prisma models (users, holdings, transactions, dividends, watchlist items, alerts, journal entries, and daily snapshots) tie the whole app together.

## Running locally

```bash
npm install
npx prisma generate
npm run dev
```

Then open http://localhost:3000.

Environment variables (database URL, `AUTH_SECRET`, and market-data API keys) go in a local `.env` file — it is git-ignored and never committed.

---

*Personal project by [Jaime Leon](https://github.com/xKAMALEONx) — Computer Engineering student at UTEP.*
