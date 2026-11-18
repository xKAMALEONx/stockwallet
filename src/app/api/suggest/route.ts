import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { suggestForSymbol } from "@/lib/thesis-suggest-source";
import { isValidSymbol, normalizeSymbol } from "@/lib/validation";

// User-facing: the Bet Journal form calls this when you pick a ticker to get an
// auto-computed conviction + long-term compounding target. Session-gated by the
// middleware (browser cookie), so no ?token here — it's you, logged in.
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await getSession();
  // Must be a fully-authenticated session, not a mid-2FA-setup one.
  if (!session || session.stage !== "full") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = normalizeSymbol(searchParams.get("symbol"));
  if (!isValidSymbol(symbol)) {
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
      fair: null,
      price: null,
    });
  }
}
