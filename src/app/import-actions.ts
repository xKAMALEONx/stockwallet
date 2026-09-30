"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultAccount } from "@/lib/trades";
import {
  parseRobinhoodCsv,
  summarizeSkips,
  tradeKey,
  type ParsedRhTrade,
} from "@/lib/robinhood-import";

export type ImportState = {
  phase: "idle" | "preview" | "done" | "error";
  message?: string;
  // Preview stats
  parsed?: number;
  newCount?: number;
  duplicateCount?: number;
  skippedSummary?: string;
  sample?: { symbol: string; side: string; quantity: string; price: string; date: string }[];
  // Round-trips the file content so "Confirm" can commit without re-upload.
  csv?: string;
  // Done stats
  imported?: number;
};

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("csv");
  if (file && typeof file === "object" && "text" in file && typeof file.text === "function") {
    const text = await (file as File).text();
    return text.length > 0 ? text : null;
  }
  // Fallback: hidden textarea round-trip on confirm.
  const raw = formData.get("csvText");
  return raw ? String(raw) : null;
}

/**
 * Two-phase import driven by useActionState.
 * - No "confirm" field → parse + return a preview (nothing written).
 * - "confirm" field set → re-parse the round-tripped CSV, de-dupe against the
 *   existing ledger, and bulk-insert only genuinely new trades.
 */
export async function importRobinhood(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const confirming = String(formData.get("confirm") ?? "") === "1";
  const csv = await readCsv(formData);
  if (!csv) {
    return { phase: "error", message: "Choose a Robinhood CSV export first." };
  }

  const { trades, skipped, error } = parseRobinhoodCsv(csv);
  if (error) {
    return { phase: "error", message: error };
  }
  if (trades.length === 0) {
    return {
      phase: "error",
      message:
        "No buy/sell trades found in this file" +
        (skipped.length ? ` (skipped ${summarizeSkips(skipped)}).` : "."),
    };
  }

  const account = await getOrCreateDefaultAccount(session!.sub);

  // Build the set of keys already in the ledger so re-imports don't double up.
  const existing = await prisma.transaction.findMany({
    where: { accountId: account.id },
    select: { symbol: true, side: true, quantity: true, price: true, tradedAt: true },
  });
  const existingKeys = new Set(
    existing.map((t) =>
      tradeKey({
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity.toString(),
        price: t.price.toString(),
        tradedAt: t.tradedAt,
      }),
    ),
  );

  // Also de-dupe within the file itself.
  const seen = new Set<string>();
  const fresh: ParsedRhTrade[] = [];
  let duplicateCount = 0;
  for (const t of trades) {
    const key = tradeKey(t);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    fresh.push(t);
  }

  if (!confirming) {
    return {
      phase: "preview",
      parsed: trades.length,
      newCount: fresh.length,
      duplicateCount,
      skippedSummary: skipped.length ? summarizeSkips(skipped) : undefined,
      sample: fresh.slice(0, 8).map((t) => ({
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        date: t.tradedAt.toISOString().slice(0, 10),
      })),
      csv,
    };
  }

  // Commit phase.
  if (fresh.length === 0) {
    return {
      phase: "done",
      imported: 0,
      message: "Everything in that file was already imported — nothing to add.",
    };
  }

  await prisma.transaction.createMany({
    data: fresh.map((t) => ({
      accountId: account.id,
      symbol: t.symbol,
      side: t.side,
      quantity: new Prisma.Decimal(t.quantity),
      price: new Prisma.Decimal(t.price),
      fees: new Prisma.Decimal(t.fees),
      tradedAt: t.tradedAt,
      note: t.note,
    })),
  });

  revalidatePath("/");
  return {
    phase: "done",
    imported: fresh.length,
    duplicateCount,
    message: `Imported ${fresh.length} trade${fresh.length === 1 ? "" : "s"} into your ledger.`,
  };
}
