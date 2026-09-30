import { describe, it, expect } from "vitest";
import {
  parseRobinhoodCsv,
  parseCsvLine,
  summarizeSkips,
  tradeKey,
} from "./robinhood-import";

const HEADER =
  '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseCsvLine", () => {
  it("splits simple comma fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("respects quoted fields containing commas", () => {
    expect(parseCsvLine('"AAPL","Apple Inc, Class A","Buy"')).toEqual([
      "AAPL",
      "Apple Inc, Class A",
      "Buy",
    ]);
  });

  it("handles escaped double-quotes", () => {
    expect(parseCsvLine('"she said ""hi""",x')).toEqual(['she said "hi"', "x"]);
  });
});

describe("parseRobinhoodCsv — trades", () => {
  it("parses a simple buy", () => {
    const { trades, skipped, error } = parseRobinhoodCsv(
      csv('"1/2/2026","1/2/2026","1/3/2026","AAPL","Apple","Buy","10","$150.00","-$1500.00"'),
    );
    expect(error).toBeNull();
    expect(skipped).toHaveLength(0);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: "AAPL",
      side: "BUY",
      quantity: "10",
      price: "150.00",
      fees: "0",
    });
    expect(trades[0].tradedAt.getFullYear()).toBe(2026);
  });

  it("parses a sell", () => {
    const { trades } = parseRobinhoodCsv(
      csv('"3/1/2026","3/1/2026","3/2/2026","TSLA","Tesla","Sell","2","$250.50","$501.00"'),
    );
    expect(trades[0]).toMatchObject({ symbol: "TSLA", side: "SELL", quantity: "2", price: "250.50" });
  });

  it("keeps fractional shares as exact decimal strings", () => {
    const { trades } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/2/2026","NVDA","Nvidia","Buy","0.1337","$800.00","-$106.96"'),
    );
    expect(trades[0].quantity).toBe("0.1337");
  });

  it("strips $ and thousands commas from price", () => {
    const { trades } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/2/2026","BRK.A","Berkshire","Buy","1","$1,234.56","-$1,234.56"'),
    );
    expect(trades[0].price).toBe("1234.56");
    expect(trades[0].symbol).toBe("BRK.A");
  });

  it("uppercases lowercase tickers", () => {
    const { trades } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/2/2026","aapl","Apple","buy","1","$150","-$150"'),
    );
    expect(trades[0].symbol).toBe("AAPL");
    expect(trades[0].side).toBe("BUY");
  });
});

describe("parseRobinhoodCsv — skips non-trades", () => {
  it("skips dividends (CDIV) and flags them as dividend", () => {
    const { trades, skipped } = parseRobinhoodCsv(
      csv('"2/15/2026","2/15/2026","2/15/2026","AAPL","Apple Cash Dividend","CDIV","","","$4.20"'),
    );
    expect(trades).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe("dividend");
  });

  it("skips ACH transfers", () => {
    const { skipped } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/1/2026","","ACH Deposit","ACH","","","$500.00"'),
    );
    expect(skipped[0].reason).toBe("transfer");
  });

  it("skips interest/gold rows", () => {
    const { skipped } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/1/2026","","Gold Interest","INT","","","$0.55"'),
    );
    expect(skipped[0].reason).toBe("interest");
  });

  it("skips option legs", () => {
    const { skipped } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/1/2026","AAPL","Call","STC","1","$1.20","$120.00"'),
    );
    expect(skipped[0].reason).toBe("option");
  });

  it("skips a buy row with a missing symbol", () => {
    const { skipped } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/1/2026","","Mystery","Buy","1","$10","-$10"'),
    );
    expect(skipped[0].reason).toBe("no-symbol");
  });

  it("skips a buy row with an unparseable quantity", () => {
    const { skipped } = parseRobinhoodCsv(
      csv('"2/1/2026","2/1/2026","2/1/2026","AAPL","Apple","Buy","","$10","-$10"'),
    );
    expect(skipped[0].reason).toBe("bad-number");
  });
});

describe("parseRobinhoodCsv — file-level", () => {
  it("errors on an empty file", () => {
    expect(parseRobinhoodCsv("").error).toMatch(/empty/i);
  });

  it("errors on a non-Robinhood CSV", () => {
    const r = parseRobinhoodCsv("foo,bar,baz\n1,2,3");
    expect(r.error).toMatch(/Robinhood/i);
    expect(r.trades).toHaveLength(0);
  });

  it("tolerates CRLF line endings and a trailing newline", () => {
    const text = HEADER + "\r\n" +
      '"2/1/2026","2/1/2026","2/2/2026","AAPL","Apple","Buy","1","$10","-$10"' + "\r\n";
    const { trades, error } = parseRobinhoodCsv(text);
    expect(error).toBeNull();
    expect(trades).toHaveLength(1);
  });

  it("handles newlines inside quoted fields (real RH instrument wrap)", () => {
    // Robinhood writes the instrument as "NVIDIA\nCUSIP: 67066G104" — the field
    // spans two physical lines. The record splitter must not break there.
    const text =
      HEADER +
      "\n" +
      '"8/4/2025","8/4/2025","8/5/2025","NVDA","NVIDIA\nCUSIP: 67066G104","Buy","1.11685","$179.08","($200.00)"' +
      "\n" +
      '"8/21/2026","8/21/2026","8/24/2026","NVDA","NVIDIA\nCUSIP: 67066G104","Sell","0.162669","$215.16","$35.00"';
    const { trades, error } = parseRobinhoodCsv(text);
    expect(error).toBeNull();
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ symbol: "NVDA", side: "BUY", quantity: "1.11685", price: "179.08" });
    expect(trades[1]).toMatchObject({ symbol: "NVDA", side: "SELL", quantity: "0.162669", price: "215.16" });
  });

  it("finds columns by name even if reordered", () => {
    const reordered =
      '"Trans Code","Instrument","Quantity","Price","Activity Date","Description"\n' +
      '"Buy","MSFT","3","$400","5/1/2026","Microsoft"';
    const { trades, error } = parseRobinhoodCsv(reordered);
    expect(error).toBeNull();
    expect(trades[0]).toMatchObject({ symbol: "MSFT", side: "BUY", quantity: "3", price: "400" });
  });
});

describe("summarizeSkips", () => {
  it("counts and pluralizes reasons", () => {
    const { skipped } = parseRobinhoodCsv(
      csv(
        '"2/15/2026","2/15/2026","2/15/2026","AAPL","Div","CDIV","","","$4"',
        '"2/16/2026","2/16/2026","2/16/2026","MSFT","Div","CDIV","","","$2"',
        '"2/1/2026","2/1/2026","2/1/2026","","Deposit","ACH","","","$500"',
      ),
    );
    expect(summarizeSkips(skipped)).toBe("2 dividends, 1 transfer");
  });
});

describe("tradeKey — idempotency", () => {
  it("is identical for the same trade", () => {
    const a = tradeKey({ symbol: "AAPL", side: "BUY", quantity: "10", price: "150", tradedAt: new Date("2026-01-02") });
    const b = tradeKey({ symbol: "aapl", side: "BUY", quantity: "10", price: "150", tradedAt: new Date("2026-01-02T18:00:00Z") });
    expect(a).toBe(b);
  });

  it("differs when any field differs", () => {
    const base = { symbol: "AAPL", side: "BUY", quantity: "10", price: "150", tradedAt: new Date("2026-01-02") };
    expect(tradeKey(base)).not.toBe(tradeKey({ ...base, price: "151" }));
  });
});
