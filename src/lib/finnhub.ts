import "server-only";

// Shared Finnhub client. The free tier allows ~60 requests/minute; a cold load
// of Ideas or Allocation fans out well over a hundred calls at once (quotes,
// sectors, consensus, fundamentals, earnings, insider — per candidate). Fired
// unthrottled, Finnhub answers a chunk with HTTP 429 and the rest of the page's
// data comes back empty, so ideas vanish and news "won't load."
//
// This funnels every finnhub.io request through one gate that:
//   1. caps in-flight concurrency so we stay under the per-minute limit,
//   2. retries a 429 a few times with backoff instead of giving up,
//   3. de-dupes identical in-flight URLs (e.g. consensus + trend hit the same
//      endpoint) so the same bytes aren't fetched twice in one render.
//
// Next's fetch cache still does the heavy lifting on warm loads — this just
// keeps the *cold* load from stampeding the rate limit.

// Conservative cap: well under 60/min even if several requests are slow. Finnhub
// counts per-minute, so a handful in flight at once drains the budget smoothly
// rather than all at once.
const MAX_CONCURRENT = 6;
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 600;

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) {
    active++;
    next();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Collapse identical concurrent URLs within a single render pass. Keyed by the
// full URL (token included, but these never leave the server).
const inflight = new Map<string, Promise<Response>>();

type FetchOpts = { revalidate?: number };

/**
 * Rate-limited fetch for finnhub.io. Returns the Response (possibly a non-OK
 * one after exhausting retries); callers keep their existing `res.ok` handling
 * and graceful-degradation paths. Throws only on a genuine network failure,
 * which callers already catch.
 */
export async function finnhubFetch(
  url: string,
  opts: FetchOpts = {},
): Promise<Response> {
  const existing = inflight.get(url);
  if (existing) {
    // Clone so each caller gets an independent, readable body.
    return existing.then((r) => r.clone());
  }

  const run = (async (): Promise<Response> => {
    await acquire();
    try {
      let attempt = 0;
      while (true) {
        const res = await fetch(url, {
          next: opts.revalidate != null ? { revalidate: opts.revalidate } : undefined,
        });
        // Retry only on rate-limit (429) and transient upstream (5xx).
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : BASE_BACKOFF_MS * 2 ** attempt;
          attempt++;
          await sleep(wait);
          continue;
        }
        return res;
      }
    } finally {
      release();
    }
  })();

  inflight.set(url, run);
  try {
    const res = await run;
    return res.clone();
  } finally {
    inflight.delete(url);
  }
}
