import "server-only";

// News-driven idea discovery via Marketaux. Free tier returns 3 articles per
// request, so we page a few times and aggregate ticker mentions + sentiment.
// Cached ~6h to stay well within the 100 req/day budget.

export type NewsArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
};

export type Idea = {
  symbol: string;
  avgSentiment: number; // -1..1 (news sentiment)
  mentions: number;
  articles: NewsArticle[];
};

const MIN_MATCH = 30; // relevance floor (universe whitelist already ensures quality)
const PAGES = 8; // 8 * 3 = up to 24 recent articles about the universe
const REVALIDATE = 21600; // 6h
const US_TICKER = /^[A-Z]{1,5}$/;
const MAX_CANDIDATES = 20;

// Curated universe of quality US large/mid-caps. Discovery is scoped to these,
// so only real, covered, quotable companies ever surface (no OTC/PR-wire noise).
const UNIVERSE = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "AMD", "CRM",
  "ADBE", "ORCL", "INTC", "QCOM", "CSCO", "IBM", "NFLX", "PLTR", "UBER", "SHOP",
  "JPM", "BAC", "WFC", "GS", "MS", "V", "MA", "PYPL", "AXP",
  "UNH", "JNJ", "LLY", "MRK", "PFE", "ABBV", "TMO",
  "WMT", "COST", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "DIS",
  "XOM", "CVX", "CAT", "BA", "GE", "LIN", "T", "VZ", "CMCSA",
];
const UNIVERSE_SET = new Set(UNIVERSE);

type RawEntity = {
  type?: string;
  symbol?: string;
  sentiment_score?: number;
  match_score?: number;
};
type RawArticle = {
  title?: string;
  source?: string;
  url?: string;
  published_at?: string;
  entities?: RawEntity[];
};

export async function getNewsIdeas(): Promise<Idea[]> {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) return [];

  const byTicker = new Map<
    string,
    { sentiments: number[]; articles: Map<string, NewsArticle> }
  >();

  for (let page = 1; page <= PAGES; page++) {
    try {
      const res = await fetch(
        `https://api.marketaux.com/v1/news/all?symbols=${UNIVERSE.join(",")}&filter_entities=true&language=en&limit=3&page=${page}&api_token=${key}`,
        { next: { revalidate: REVALIDATE } },
      );
      if (!res.ok) break;
      const data = (await res.json()) as { data?: RawArticle[] };
      for (const a of data.data ?? []) {
        if (!a.url || !a.title) continue;
        const article: NewsArticle = {
          title: a.title,
          source: a.source ?? "news",
          url: a.url,
          publishedAt: a.published_at ?? "",
        };
        for (const e of a.entities ?? []) {
          if (e.type !== "equity") continue;
          if (typeof e.match_score === "number" && e.match_score < MIN_MATCH) {
            continue;
          }
          const sym = String(e.symbol ?? "").toUpperCase();
          if (!US_TICKER.test(sym) || !UNIVERSE_SET.has(sym)) continue;
          if (!byTicker.has(sym)) {
            byTicker.set(sym, { sentiments: [], articles: new Map() });
          }
          const rec = byTicker.get(sym)!;
          if (typeof e.sentiment_score === "number") {
            rec.sentiments.push(e.sentiment_score);
          }
          rec.articles.set(article.url, article);
        }
      }
    } catch {
      break;
    }
  }

  const ideas: Idea[] = [];
  for (const [symbol, rec] of byTicker) {
    const articles = [...rec.articles.values()].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
    const avgSentiment = rec.sentiments.length
      ? rec.sentiments.reduce((s, x) => s + x, 0) / rec.sentiments.length
      : 0;
    ideas.push({ symbol, avgSentiment, mentions: articles.length, articles });
  }

  ideas.sort(
    (a, b) =>
      b.mentions - a.mentions ||
      Math.abs(b.avgSentiment) - Math.abs(a.avgSentiment),
  );
  return ideas.slice(0, MAX_CANDIDATES);
}

export function newsEnabled(): boolean {
  return Boolean(process.env.MARKETAUX_API_KEY);
}

/** Recent tagged news for a single ticker (for the Trade Guard news read). */
export async function getSymbolNews(
  symbol: string,
): Promise<{ avgSentiment: number | null; articles: NewsArticle[] }> {
  const key = process.env.MARKETAUX_API_KEY;
  const sym = symbol.toUpperCase();
  if (!key || !sym) return { avgSentiment: null, articles: [] };
  try {
    const res = await fetch(
      `https://api.marketaux.com/v1/news/all?symbols=${sym}&filter_entities=true&language=en&limit=3&api_token=${key}`,
      { next: { revalidate: 1800 } }, // 30m cache
    );
    if (!res.ok) return { avgSentiment: null, articles: [] };
    const data = (await res.json()) as { data?: RawArticle[] };
    const articles: NewsArticle[] = [];
    const sentiments: number[] = [];
    for (const a of data.data ?? []) {
      if (!a.url || !a.title) continue;
      articles.push({
        title: a.title,
        source: a.source ?? "news",
        url: a.url,
        publishedAt: a.published_at ?? "",
      });
      for (const e of a.entities ?? []) {
        if (
          e.type === "equity" &&
          String(e.symbol ?? "").toUpperCase() === sym &&
          typeof e.sentiment_score === "number"
        ) {
          sentiments.push(e.sentiment_score);
        }
      }
    }
    const avgSentiment = sentiments.length
      ? sentiments.reduce((s, x) => s + x, 0) / sentiments.length
      : null;
    return { avgSentiment, articles };
  } catch {
    return { avgSentiment: null, articles: [] };
  }
}

/** Plain-English read of the news for the specific trade being considered. */
export function newsTradeSummary(
  avg: number | null,
  action: "BUY" | "SELL",
  hasArticles: boolean,
): { tone: "pos" | "neg" | "neutral"; lean: string; nuance: string } {
  if (!hasArticles || avg === null) {
    return {
      tone: "neutral",
      lean: "No recent tagged news",
      nuance:
        "Nothing notable in the headlines right now — this comes down to your own thesis, valuation, and the rules above.",
    };
  }
  const tone = avg > 0.15 ? "pos" : avg < -0.15 ? "neg" : "neutral";
  const lean =
    tone === "pos"
      ? "Recent news leans positive"
      : tone === "neg"
        ? "Recent news leans negative"
        : "Recent news is mixed";
  let nuance: string;
  if (action === "BUY") {
    nuance =
      tone === "pos"
        ? "A tailwind — just make sure you're buying the business, not chasing the hype."
        : tone === "neg"
          ? "There's negative news right now — understand what's driving it before you buy the dip."
          : "Nothing dramatic in the headlines — this rests on your thesis and valuation.";
  } else {
    nuance =
      tone === "neg"
        ? "Negative headlines — is this a real change to your thesis, or short-term noise you'd regret selling into?"
        : tone === "pos"
          ? "News is positive — are you selling into strength for a clear reason?"
          : "Quiet news — make sure this sell is thesis-driven, not a mood.";
  }
  return { tone, lean, nuance };
}

export function sentimentLabel(v: number): {
  label: string;
  tone: "pos" | "neg" | "neutral";
} {
  if (v > 0.15) return { label: "Positive", tone: "pos" };
  if (v < -0.15) return { label: "Negative", tone: "neg" };
  return { label: "Neutral", tone: "neutral" };
}
