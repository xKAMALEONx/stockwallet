// One-time backfill: give every existing Transaction a stable `importKey` using
// the SAME tradeKey() the importer uses, so the new unique(accountId, importKey)
// constraint protects pre-existing rows from being re-imported as duplicates.
//
// Safe to run repeatedly:
//   - only touches rows where importKey IS NULL
//   - within an account, if two existing rows canonicalize to the same key
//     (a real pre-existing duplicate), only the first gets the key; the rest are
//     left NULL and reported, so the unique index can still be created.
//
// Run AFTER the schema migration adds the column, BEFORE relying on idempotent
// imports:  node --env-file=.env scripts/backfill-import-keys.mjs
//
// Uses the compiled tradeKey via a tiny inline re-implementation kept in lockstep
// with src/lib/robinhood-import.ts (canonNum + tradeKey). If that logic changes,
// update both.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function canonNum(v, decimals) {
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return String(v).trim();
  const rounded =
    decimals === undefined ? n : Math.round(n * 10 ** decimals) / 10 ** decimals;
  let s = rounded.toFixed(decimals === undefined ? 10 : decimals);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

function tradeKey(t) {
  const day = t.tradedAt.toISOString().slice(0, 10);
  const qty = canonNum(t.quantity);
  const price = canonNum(t.price, 2);
  return `${t.symbol.toUpperCase()}|${t.side.toUpperCase()}|${qty}|${price}|${day}`;
}

async function main() {
  const rows = await prisma.transaction.findMany({
    where: { importKey: null },
    select: { id: true, accountId: true, symbol: true, side: true, quantity: true, price: true, tradedAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Rows needing a key: ${rows.length}`);

  const usedPerAccount = new Map(); // accountId -> Set(keys)
  // Seed with any keys already present (shouldn't be any on first run, but safe).
  const existing = await prisma.transaction.findMany({
    where: { importKey: { not: null } },
    select: { accountId: true, importKey: true },
  });
  for (const e of existing) {
    if (!usedPerAccount.has(e.accountId)) usedPerAccount.set(e.accountId, new Set());
    usedPerAccount.get(e.accountId).add(e.importKey);
  }

  let keyed = 0;
  const collisions = [];
  for (const r of rows) {
    const key = tradeKey({
      symbol: r.symbol,
      side: r.side,
      quantity: r.quantity.toString(),
      price: r.price.toString(),
      tradedAt: r.tradedAt,
    });
    if (!usedPerAccount.has(r.accountId)) usedPerAccount.set(r.accountId, new Set());
    const used = usedPerAccount.get(r.accountId);
    if (used.has(key)) {
      // A genuine pre-existing duplicate in the same account — leave NULL.
      collisions.push({ id: r.id, symbol: r.symbol, key });
      continue;
    }
    used.add(key);
    await prisma.transaction.update({ where: { id: r.id }, data: { importKey: key } });
    keyed++;
  }

  console.log(`Keyed: ${keyed}`);
  if (collisions.length) {
    console.log(`Left NULL (pre-existing duplicates, ${collisions.length}):`);
    for (const c of collisions) console.log(`  ${c.symbol}  ${c.key}  (txn ${c.id})`);
  } else {
    console.log("No duplicate collisions.");
  }
}

main()
  .catch((e) => {
    console.error("BACKFILL_FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
