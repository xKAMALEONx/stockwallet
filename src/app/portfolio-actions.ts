"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
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

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

// Returns a parsed trade, or an error message string.
function parseTrade(formData: FormData): ParsedTrade | string {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const side = String(formData.get("side")) === "SELL" ? "SELL" : "BUY";
  const quantity = String(formData.get("quantity") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();
  const feesRaw = String(formData.get("fees") ?? "").trim();
  const tradedAtRaw = String(formData.get("tradedAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!SYMBOL_RE.test(symbol)) return "Enter a valid ticker (e.g. AAPL).";

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
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = parseTrade(formData);
  if (typeof parsed === "string") {
    redirect("/?error=" + encodeURIComponent(parsed));
  }

  const account = await getOrCreateDefaultAccount(session!.sub);
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
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = parseTrade(formData);
  if (typeof parsed === "string") {
    redirect(`/trades/${id}/edit?error=` + encodeURIComponent(parsed));
  }

  const account = await getOrCreateDefaultAccount(session!.sub);
  // Ownership-scoped update.
  await prisma.transaction.updateMany({
    where: { id, accountId: account.id },
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

  revalidatePath("/");
  redirect("/");
}

export async function deleteTrade(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const account = await getOrCreateDefaultAccount(session!.sub);
  await prisma.transaction.deleteMany({ where: { id, accountId: account.id } });

  revalidatePath("/");
  redirect("/");
}
