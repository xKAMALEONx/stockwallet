type Numish = { toNumber(): number } | number | null | undefined;

function toNum(v: Numish): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : v.toNumber();
}

export function money(v: Numish): string {
  const n = toNum(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function signedMoney(v: Numish): string {
  const n = toNum(v);
  if (n === null) return "—";
  const s = money(Math.abs(n));
  return n < 0 ? `-${s}` : `+${s}`;
}

export function shares(v: Numish): string {
  const n = toNum(v);
  if (n === null) return "—";
  // Trim trailing zeros, allow up to 8 decimals for fractional shares.
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/** Tailwind text color for a gain/loss value. */
export function pnlColor(v: Numish): string {
  const n = toNum(v);
  if (n === null || n === 0) return "text-zinc-400";
  return n > 0 ? "text-emerald-400" : "text-red-400";
}
