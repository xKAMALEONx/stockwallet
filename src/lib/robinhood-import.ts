// Robinhood activity-report CSV → StockWallet trade ledger.
//
// Robinhood's "Account activity report" export is a CSV with a header row and
// one row per account event. We only turn genuine equity BUY/SELL rows into
// Transaction records; everything else (dividends, transfers, interest, option
// legs, fees) is skipped on purpose — the cost-basis engine only understands
// share-changing buys and sells, and dividends have their own Dividend table.
//
// This module is a PURE parser: raw CSV text in, parsed rows out. No DB, no
// session — so it's fully unit-testable, matching the rest of src/lib.
//
// NOTE: Robinhood has shipped a few header variants over the years. Column
// lookup here is by NAME (case-insensitive), not position, so added/reordered
// columns don't break it. The expected canonical header is:
//   "Activity Date","Process Date","Settle Date","Instrument","Description",
//   "Trans Code","Quantity","Price","Amount"

export type ParsedRhTrade = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string; // decimal string, kept as text to avoid float drift
  price: string; // per-share, decimal string
  fees: string; // Robinhood equity trades are almost always "0"
  tradedAt: Date;
  note: string; // e.g. "Robinhood import — <description>"
};

export type SkipReason =
  | "dividend" // CDIV — belongs in the Dividend table, not the ledger
  | "transfer" // ACH / RTP / deposits / withdrawals
  | "interest" // INT / gold / cash sweep
  | "option" // BTO / STC / OEXP etc. — not modeled yet
  | "non-trade" // any other recognized non-buy/sell code
  | "no-symbol" // buy/sell row missing an instrument
  | "bad-number" // quantity/price didn't parse
  | "bad-date"; // couldn't read a date

export type SkippedRow = {
  line: number; // 1-based data-row index (excludes header)
  transCode: string;
  symbol: string;
  reason: SkipReason;
  raw: string;
};

export type RhImportResult = {
  trades: ParsedRhTrade[];
  skipped: SkippedRow[];
  /** Fatal problem with the file itself (bad header / not a CSV). */
  error: string | null;
};

// Trans Code → what to do. Only Buy/Sell become trades.
const BUY_CODES = new Set(["BUY"]);
const SELL_CODES = new Set(["SELL"]);
const DIVIDEND_CODES = new Set(["CDIV", "DIV", "DIVIDEND"]);
const TRANSFER_CODES = new Set(["ACH", "RTP", "DEP", "WITH", "TRANSFER"]);
const INTEREST_CODES = new Set(["INT", "GOLD", "CSWP", "MINT"]);
const OPTION_CODES = new Set(["BTO", "STO", "BTC", "STC", "OEXP", "OASGN"]);

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

/** Strip "$", commas, surrounding spaces, and wrapping parens (RH negatives). */
function cleanNumber(raw: string): string {
  let s = raw.trim().replace(/[$,\s]/g, "");
  // Robinhood writes negatives as ($1.23) sometimes.
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  if (neg && s && !s.startsWith("-")) s = "-" + s;
  return s;
}

/** Parse one CSV line into fields, honoring double-quoted quoting + "" escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++; // consume escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Split raw file text into CSV records, tolerating CRLF and a trailing newline.
 *
 * Quote-aware: Robinhood wraps some fields across physical lines (e.g. the
 * Instrument description "NVIDIA\nCUSIP: 67066G104"), so a newline *inside* a
 * quoted field must NOT end the record. We track quote state across the whole
 * text and only break on newlines that fall outside quotes. "" is a legal
 * escaped quote inside a quoted field and does not toggle state.
 */
function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '""';
        i++; // consume the escaped quote pair whole
        continue;
      }
      inQuotes = !inQuotes;
      cur += ch;
    } else if (ch === "\n" && !inQuotes) {
      records.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) records.push(cur);
  return records.filter((l) => l.trim().length > 0);
}

function classifyNonTrade(code: string): SkipReason {
  if (DIVIDEND_CODES.has(code)) return "dividend";
  if (TRANSFER_CODES.has(code)) return "transfer";
  if (INTEREST_CODES.has(code)) return "interest";
  if (OPTION_CODES.has(code)) return "option";
  return "non-trade";
}

/**
 * Parse a full Robinhood activity-report CSV into trades + a skip ledger.
 * Never throws on row-level problems — bad rows land in `skipped` so the
 * import UI can show exactly what was and wasn't brought in.
 */
export function parseRobinhoodCsv(text: string): RhImportResult {
  const lines = splitLines(text);
  if (lines.length === 0) {
    return { trades: [], skipped: [], error: "The file is empty." };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());

  const iInstrument = col("instrument");
  const iCode = col("trans code");
  const iQty = col("quantity");
  const iPrice = col("price");
  const iDesc = col("description");
  // Prefer the actual trade date; fall back through RH's date variants.
  const iDate = [
    col("activity date"),
    col("process date"),
    col("settle date"),
    col("date"),
  ].find((n) => n >= 0);

  if (iCode < 0 || iQty < 0 || iPrice < 0 || iInstrument < 0 || iDate === undefined) {
    return {
      trades: [],
      skipped: [],
      error:
        "This doesn't look like a Robinhood activity report. Expected columns " +
        "including Instrument, Trans Code, Quantity, Price, and a date.",
    };
  }

  const trades: ParsedRhTrade[] = [];
  const skipped: SkippedRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    const fields = parseCsvLine(raw);
    const code = (fields[iCode] ?? "").trim().toUpperCase();
    const symbol = (fields[iInstrument] ?? "").trim().toUpperCase();
    const line = r; // 1-based data row

    const isBuy = BUY_CODES.has(code);
    const isSell = SELL_CODES.has(code);

    if (!isBuy && !isSell) {
      skipped.push({ line, transCode: code, symbol, reason: classifyNonTrade(code), raw });
      continue;
    }

    if (!SYMBOL_RE.test(symbol)) {
      skipped.push({ line, transCode: code, symbol, reason: "no-symbol", raw });
      continue;
    }

    const qty = cleanNumber(fields[iQty] ?? "");
    const price = cleanNumber(fields[iPrice] ?? "");
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(priceNum) || priceNum < 0) {
      skipped.push({ line, transCode: code, symbol, reason: "bad-number", raw });
      continue;
    }

    const dateRaw = (fields[iDate] ?? "").trim();
    const tradedAt = new Date(dateRaw);
    if (Number.isNaN(tradedAt.getTime())) {
      skipped.push({ line, transCode: code, symbol, reason: "bad-date", raw });
      continue;
    }

    const desc = iDesc >= 0 ? (fields[iDesc] ?? "").trim() : "";
    trades.push({
      symbol,
      side: isBuy ? "BUY" : "SELL",
      quantity: qty,
      price,
      fees: "0",
      tradedAt,
      note: desc ? `Robinhood import — ${desc}` : "Robinhood import",
    });
  }

  return { trades, skipped, error: null };
}

/** Human-readable one-liner for the import preview, e.g. "3 dividends, 1 transfer". */
export function summarizeSkips(skipped: SkippedRow[]): string {
  const counts = new Map<SkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const label: Record<SkipReason, string> = {
    dividend: "dividend",
    transfer: "transfer",
    interest: "interest",
    option: "option",
    "non-trade": "other non-trade",
    "no-symbol": "missing symbol",
    "bad-number": "bad number",
    "bad-date": "bad date",
  };
  const parts: string[] = [];
  for (const [reason, n] of counts) {
    const word = label[reason];
    parts.push(`${n} ${word}${n === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

/**
 * De-dupe key for an idempotent re-import: same symbol+side+qty+price+day means
 * the same trade. Lets us re-run an export without double-counting.
 */
export function tradeKey(t: {
  symbol: string;
  side: string;
  quantity: string | number;
  price: string | number;
  tradedAt: Date;
}): string {
  const day = t.tradedAt.toISOString().slice(0, 10);
  return `${t.symbol.toUpperCase()}|${t.side}|${t.quantity}|${t.price}|${day}`;
}
