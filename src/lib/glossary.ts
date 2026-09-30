// Plain-English definitions for every metric/column shown in StockWallet.
// Written for a first-time trader: one clear sentence + a tiny number example.
// Keyed by a short slug so UI headers can pull the right tip by name.
//
// Keep these SHORT — they render inside a small tooltip bubble. If a term needs
// more than ~2 lines, trim the example, not the definition.

export type GlossaryEntry = {
  /** The plain-English definition. */
  what: string;
  /** A tiny, concrete number example. */
  example: string;
  /** What a seasoned trader would call this — the lingo, so you pick it up. */
  lingo?: string;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Summary tiles ────────────────────────────────────────────────
  "market-value": {
    what: "What all your shares are worth right now at today's prices.",
    example: "10 shares worth $50 each = $500 market value.",
  },
  "unrealized-pnl": {
    what: "Profit or loss on shares you still own — money you'd make (or lose) if you sold right now. You haven't locked it in yet.",
    example: "Paid $400, now worth $500 → +$100 unrealized.",
  },
  "cost-basis": {
    what: "The total amount you actually paid for the shares you own, including fees.",
    example: "Bought 2 shares at $100 each = $200 cost basis.",
  },
  "realized-pnl": {
    what: "Profit or loss you've already locked in by selling. This money is real and done.",
    example: "Bought at $100, sold at $130 → +$30 realized.",
  },
  "dividend-income": {
    what: "Cash a company pays you just for holding its stock — like a thank-you payment.",
    example: "Own 10 shares paying $0.25 each = $2.50 income.",
  },
  "total-return": {
    what: "Your full scorecard: profit from price changes plus all the dividends you've collected.",
    example: "+$100 price gain + $2.50 dividends = +$102.50.",
  },

  // ── Holdings table columns ───────────────────────────────────────
  symbol: {
    what: "The ticker — a stock's short nickname on the market.",
    example: "Apple is AAPL, Nvidia is NVDA.",
  },
  shares: {
    what: "How many units of the stock you own. Can be a fraction.",
    example: "0.5 shares = half of one share.",
  },
  "avg-cost": {
    what: "The average price you paid per share across all your buys.",
    example: "Bought 1 at $100 and 1 at $120 → $110 average.",
  },
  price: {
    what: "The current market price for one share, updated live.",
    example: "AAPL at $190 means one share costs $190.",
  },
  day: {
    what: "How much the price has moved up or down just today, as a percent.",
    example: "+2% means it's up 2% since the market opened.",
  },
  income: {
    what: "Total dividends this stock has paid you so far.",
    example: "Four $1 payments = $4 income from this stock.",
  },

  // ── Transactions ledger ──────────────────────────────────────────
  side: {
    what: "Whether you bought the stock (adding shares) or sold it (removing shares).",
    example: "BUY adds shares; SELL cashes them out.",
  },
  quantity: {
    what: "How many shares this single trade was for.",
    example: "A BUY of 3 means you bought 3 shares that day.",
  },
  fees: {
    what: "Any commission or charge you paid to make the trade. Often $0.",
    example: "$0 fees means the trade was free.",
  },

  // ── Performance page ─────────────────────────────────────────────
  "your-return": {
    what: "How much your whole portfolio is up or down since tracking began, including dividends. Starts counting from your first snapshot day.",
    example: "+8% means every $100 you had is now worth $108.",
  },
  "spy-return": {
    what: "How the S&P 500 (the 500 biggest US companies, ticker SPY) did over the exact same days — your yardstick for 'just buying the market.'",
    example: "SPY +5% means the market as a whole rose 5%.",
  },
  "vs-index": {
    what: "Your return minus the S&P 500's. Positive means your picks beat simply buying the index; negative means the index won.",
    example: "You +8%, SPY +5% → +3% ahead of the market.",
  },

  // ── Allocation page ──────────────────────────────────────────────
  sector: {
    what: "The slice of the economy a company belongs to, like Technology or Healthcare. Grouping by sector shows if you're too concentrated.",
    example: "Apple and Nvidia are both Technology.",
  },
  weight: {
    what: "What share of your invested money sits in this sector. Big weights mean big exposure if that sector has a bad year.",
    example: "40% weight = 40 cents of every invested dollar.",
  },
  holdings: {
    what: "The specific stocks you own inside this sector.",
    example: "Tech holdings: AAPL, NVDA.",
  },
  fit: {
    what: "A 0–100 score for how well an idea fits long-term, steady investing — reward earned per unit of risk, with big crashes penalized. Higher = more return for less pain. Not a prediction.",
    example: "70 is a smoother compounder than 45.",
    lingo: "risk-adjusted return (cousin of the Sharpe ratio)",
  },
  cagr: {
    what: "Compound annual growth rate — the smoothed yearly return if growth were perfectly even.",
    example: "10% CAGR ≈ doubling your money in ~7 years.",
    lingo: "CAGR / annualized return",
  },
  volatility: {
    what: "How bumpy the ride is — how much the price swings around. Higher means bigger ups and downs.",
    example: "Low vol = steady; high vol = roller coaster.",
  },
  "max-drawdown": {
    what: "The worst peak-to-bottom drop it suffered in the window — the deepest pain you'd have sat through.",
    example: "-30% means it once fell 30% from a high.",
    lingo: "max drawdown / max DD; \"how far underwater\"",
  },

  // ── Bet Journal ──────────────────────────────────────────────────
  "ideas-logged": {
    what: "How many trade ideas (theses) you've written down here so far.",
    example: "12 means you've logged 12 calls.",
  },
  "win-rate": {
    what: "Of the ideas you've graded, the share you got right. Only closed/graded ones count.",
    example: "6 right out of 10 graded = 60% win rate.",
  },
  conviction: {
    what: "How sure you were when you logged the idea — Low, Medium, or High. Splitting win rate by conviction shows if your 'sure things' actually pay off.",
    example: "High conviction should win more than Low.",
  },

  // ── Ideas page (long-term lens) ──────────────────────────────────
  sentiment: {
    what: "Whether recent news coverage leans positive or negative overall. A mood read, not a fact about the business.",
    example: "Positive = more upbeat headlines than gloomy ones.",
  },
  consensus: {
    what: "How Wall Street analysts rate the stock overall — how many say buy, hold, or sell.",
    example: "8 buy · 2 hold · 0 sell = broadly bullish.",
    lingo: "the Street / analyst consensus rating",
  },
  pe: {
    what: "Price-to-earnings — the price you pay for each $1 the company earns a year. Rough gauge of how pricey a stock is.",
    example: "P/E 20 = $20 of price per $1 of yearly profit.",
    lingo: "P/E / the multiple; \"trading at 20 times earnings\"",
  },
  "week-52": {
    what: "The lowest and highest price over the past year, and where today's price sits between them.",
    example: "90% of range = near its 12-month high.",
  },

  // ── Projection panel (the "what can I expect?" tool) ─────────────
  "proj-rating": {
    what: "A quick verdict on how good a long-term hold this looks like, based on how steadily it has grown vs. how violently it has crashed in the past. It's a summary of the fit score below — not a promise it'll keep doing it.",
    example: "\"Strong long-term profile\" = smooth grower; \"Choppy\" = wild ride.",
    lingo: "risk-adjusted quality / the setup",
  },
  "proj-direction": {
    what: "Which way the system is leaning: Bullish means it expects the price to rise over your horizon, Bearish means fall. Here it comes from whether the tempered growth rate is positive.",
    example: "▲ Bullish = betting it goes up; ▼ Bearish = betting it drops.",
    lingo: "your bias / going long (bull) vs short (bear)",
  },
  "proj-conviction": {
    what: "How much the system suggests you trust this pick — Low, Medium, or High. It's driven by the fit score and whether Wall Street analysts agree. Think of it as suggested position confidence, not a guarantee.",
    example: "High = size it like you mean it; Low = keep it small.",
    lingo: "conviction / how much size to put on",
  },
  "proj-target": {
    what: "A price-per-share the stock could REACH by the end of your horizon IF it keeps compounding at the tempered growth rate. It's a price goal for ONE share, not money you receive and not a guarantee. You only realize it if you actually sell there.",
    example: "Target $362 on a $187 share = the system's goal for that one share in your chosen years.",
    lingo: "price target / PT",
  },
  "proj-multiple": {
    what: "How many times bigger the target is than today's price. A shorthand for the whole gain in one number.",
    example: "1.9× means the share would be worth almost double.",
    lingo: "the multiple / a 2-bagger (2×), 3-bagger (3×)…",
  },
  "proj-money": {
    what: "Plays your dollar amount through the projection: it buys fractional shares at today's price, then values those SAME shares at the target price. The (+$, +%) is the paper profit if the target is hit. Nothing is bought — it's a what-if, and only real if you invest and later sell there.",
    example: "$100 at $187 buys 0.535 shares; at a $362 target that's ~$194.",
    lingo: "projected P&L / unrealized gain",
  },
  "proj-cagr": {
    what: "The tempered yearly growth rate the whole projection is built on. We take the stock's past annual pace, cap it, and shave it down (assume it cools as the company matures) so the target is grounded, not a fantasy. Everything compounds off this number.",
    example: "18%/yr tempered means each year ≈ 1.18× the last.",
    lingo: "projected CAGR / the compounding rate",
  },
  "proj-fair-value": {
    what: "A rough estimate of what one share is actually WORTH based on the company's earnings, versus what it costs today. \"75% above fair value\" means the market price is well over that estimate — the growth is priced in, so it's pricier and riskier if growth slips.",
    example: "Fair value $47 but trading at $187 → richly valued, priced for growth.",
    lingo: "fair value / intrinsic value; trading rich vs cheap",
  },

  // ── Alerts ───────────────────────────────────────────────────────
  condition: {
    what: "What has to happen for the alert to fire — the price rising above, or falling below, your target.",
    example: "'Rises above $250' pings you the moment it crosses $250.",
  },
};
