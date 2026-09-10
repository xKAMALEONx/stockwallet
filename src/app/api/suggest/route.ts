import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { suggestForSymbol } from "@/lib/thesis-suggest-source";

// User-facing: the Bet Journal form calls this when you pick a ticker to get an
// auto-computed conviction + long-term compounding target. Session-gated by the
// middleware (browser cookie), so no ?token here — it's you, logged in.
export const maxDuration = 30;

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = String(searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: "bad symbol" }, { status: 400 });
  }

  try {
    const suggestion = await suggestForSymbol(symbol);
    return NextResponse.json(suggestion);
  } catch {
    // Never fail the form — hand back a neutral default.
    return NextResponse.json({
      conviction: "MEDIUM",
      targetPrice: null,
      horizonYears: 5,
      targetMultiple: null,
      projectedCagrPct: null,
      rationale: "Couldn't fetch data right now — starting at Medium. Add your own read.",
      confident: false,
    });
  }
}
