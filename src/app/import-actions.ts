"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
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
  const user = await requireUser();

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

  const account = await getOrCreateDefaultAccount(user.id);

  // Preview counts come from existing keys, but the DB unique constraint on
  // (accountId, importKey) is the real guarantee: even a double-clicked confirm
  // can't insert a row twice. Build keys for display + per-row importKey.
  const existing = await prisma.transaction.findMany({
    where: { accountId: account.id, importKey: { not: null } },
    select: { importKey: true },
  });
  const existingKeys = new Set(existing.map((t) => t.importKey as string));

  // De-dupe within the file itself for the preview; keep each fresh row's key.
  const seen = new Set<string>();
  const fresh: { trade: ParsedRhTrade; key: string }[] = [];
  let duplicateCount = 0;
  for (const t of trades) {
    const key = tradeKey(t);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    fresh.push({ trade: t, key });
  }

  if (!confirming) {
    return {
      phase: "preview",
      parsed: trades.length,
      newCount: fresh.length,
      duplicateCount,
      skippedSummary: skipped.length ? summarizeSkips(skipped) : undefined,
      sample: fresh.slice(0, 8).map(({ trade: t }) => ({
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

  // skipDuplicates + the (accountId, importKey) unique constraint make this
  // idempotent: a concurrent/double confirm inserts each row at most once.
  const result = await prisma.transaction.createMany({
    skipDuplicates: true,
    data: fresh.map(({ trade: t, key }) => ({
      accountId: account.id,
      symbol: t.symbol,
      side: t.side,
      quantity: new Prisma.Decimal(t.quantity),
      price: new Prisma.Decimal(t.price),
      fees: new Prisma.Decimal(t.fees),
      tradedAt: t.tradedAt,
      note: t.note,
      importKey: key,
    })),
  });

  revalidatePath("/");
  return {
    phase: "done",
    imported: result.count,
    duplicateCount: duplicateCount + (fresh.length - result.count),
    message: `Imported ${result.count} trade${result.count === 1 ? "" : "s"} into your ledger.`,
  };
}
