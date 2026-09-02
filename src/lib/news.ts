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

const MIN_MATCH = 40; // ticker must be a real subject, not a passing mention
const PAGES = 6; // 6 * 3 = up to 18 articles per refresh
const REVALIDATE = 21600; // 6h
const US_TICKER = /^[A-Z]{1,5}$/;
const MAX_CANDIDATES = 20; // page then filters to quotable + slices

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
        `https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&countries=us&limit=3&page=${page}&api_token=${key}`,
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
          if (!US_TICKER.test(sym)) continue;
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

export function sentimentLabel(v: number): {
  label: string;
  tone: "pos" | "neg" | "neutral";
} {
  if (v > 0.15) return { label: "Positive", tone: "pos" };
  if (v < -0.15) return { label: "Negative", tone: "neg" };
  return { label: "Neutral", tone: "neutral" };
}
