"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { isValidSymbol, normalizeSymbol } from "@/lib/validation";
import { getOrCreateDefaultAccount } from "@/lib/trades";

type ParsedTrade = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fees: string;
  tradedAt: Date;
  note: string | null;
};

// Returns a parsed trade, or an error message string.
function parseTrade(formData: FormData): ParsedTrade | string {
  const symbol = normalizeSymbol(formData.get("symbol"));
  const side = String(formData.get("side")) === "SELL" ? "SELL" : "BUY";
  const quantity = String(formData.get("quantity") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();
  const feesRaw = String(formData.get("fees") ?? "").trim();
  const tradedAtRaw = String(formData.get("tradedAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!isValidSymbol(symbol)) return "Enter a valid ticker (e.g. AAPL).";

  const qtyNum = Number(quantity);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) return "Quantity must be greater than 0.";

  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) return "Price must be 0 or more.";

  const fees = feesRaw === "" ? "0" : feesRaw;
  const feesNum = Number(fees);
  if (!Number.isFinite(feesNum) || feesNum < 0) return "Fees must be 0 or more.";

  const tradedAt = tradedAtRaw ? new Date(tradedAtRaw) : new Date();
  if (Number.isNaN(tradedAt.getTime())) return "Enter a valid trade date.";

  return { symbol, side, quantity, price, fees, tradedAt, note: note || null };
}

export async function createTrade(formData: FormData) {
  const user = await requireUser();

  const parsed = parseTrade(formData);
  if (typeof parsed === "string") {
    redirect("/?error=" + encodeURIComponent(parsed));
  }

  const account = await getOrCreateDefaultAccount(user.id);
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      symbol: parsed.symbol,
      side: parsed.side,
      quantity: new Prisma.Decimal(parsed.quantity),
      price: new Prisma.Decimal(parsed.price),
      fees: new Prisma.Decimal(parsed.fees),
      tradedAt: parsed.tradedAt,
      note: parsed.note,
    },
  });

  revalidatePath("/");
  redirect("/");
}

export async function updateTrade(id: string, formData: FormData) {
  const user = await requireUser();

  const parsed = parseTrade(formData);
  if (typeof parsed === "string") {
    redirect(`/trades/${id}/edit?error=` + encodeURIComponent(parsed));
  }

  // Ownership-scoped by RELATION, so it keeps working if a second account is
  // ever added and never creates an account as a side effect of editing.
  const updated = await prisma.transaction.updateMany({
    where: { id, account: { userId: user.id } },
    data: {
      symbol: parsed.symbol,
      side: parsed.side,
      quantity: new Prisma.Decimal(parsed.quantity),
      price: new Prisma.Decimal(parsed.price),
      fees: new Prisma.Decimal(parsed.fees),
      tradedAt: parsed.tradedAt,
      note: parsed.note,
    },
  });
  if (updated.count === 0) {
    redirect(`/trades/${id}/edit?error=` + encodeURIComponent("That trade no longer exists."));
  }

  revalidatePath("/");
  redirect("/");
}

export async function deleteTrade(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  await prisma.transaction.deleteMany({
    where: { id, account: { userId: user.id } },
  });

  revalidatePath("/");
  redirect("/");
}
