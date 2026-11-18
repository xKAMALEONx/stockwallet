// Shared input validation for server actions. Centralizes the ticker regex
// (was defined ~6 times) and gives money/quantity parsing explicit bounds so a
// huge value surfaces as a friendly error instead of a Postgres overflow 500.

export const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export function isValidSymbol(s: string): boolean {
  return SYMBOL_RE.test(s);
}

export function normalizeSymbol(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

// Prisma Decimal(20,8) and Decimal(28,10) both top out well below 1e12 of
// integer digits in practice; 1e11 is a safe, generous ceiling for a personal
// portfolio and keeps us clear of column overflow.
const MAX_MONEY = 1e11;
const MAX_QUANTITY = 1e11;

export type ParseResult =
  | { ok: true; value: string } // the original trimmed string (build Decimal from it, never from a float)
  | { ok: false; error: string };

/** Parse a positive money/price string. Returns the string for Decimal(string). */
export function parseMoney(
  raw: unknown,
  label = "amount",
  { allowZero = false }: { allowZero?: boolean } = {},
): ParseResult {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: `Enter a ${label}.` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  if (n < 0) return { ok: false, error: `${label} can't be negative.` };
  if (!allowZero && n === 0) return { ok: false, error: `${label} must be greater than 0.` };
  if (n > MAX_MONEY) return { ok: false, error: `${label} is unrealistically large.` };
  return { ok: true, value: s };
}

/** Parse a positive quantity string. Returns the string for Decimal(string). */
export function parseQuantity(raw: unknown, label = "quantity"): ParseResult {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: `Enter a ${label}.` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  if (n <= 0) return { ok: false, error: `${label} must be greater than 0.` };
  if (n > MAX_QUANTITY) return { ok: false, error: `${label} is unrealistically large.` };
  return { ok: true, value: s };
}

/** Parse a date string, defaulting to now when blank. */
export function parseDate(raw: unknown): { ok: true; value: Date } | { ok: false; error: string } {
  const s = String(raw ?? "").trim();
  const d = s ? new Date(s) : new Date();
  if (Number.isNaN(d.getTime())) return { ok: false, error: "Enter a valid date." };
  return { ok: true, value: d };
}
