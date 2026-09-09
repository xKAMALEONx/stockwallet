"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export async function listDividends(userId: string) {
  return prisma.dividend.findMany({
    where: { userId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function createDividend(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!SYMBOL_RE.test(symbol)) {
    redirect("/?derror=" + encodeURIComponent("Enter a valid ticker (e.g. AAPL)."));
  }
  const amountNum = Number(amountRaw);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    redirect("/?derror=" + encodeURIComponent("Dividend amount must be greater than 0."));
  }
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    redirect("/?derror=" + encodeURIComponent("Enter a valid payment date."));
  }

  await prisma.dividend.create({
    data: {
      userId: session!.sub,
      symbol,
      amount: new Prisma.Decimal(amountRaw),
      paidAt,
      note: note || null,
    },
  });

  revalidatePath("/");
  redirect("/");
}

export async function deleteDividend(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  // Ownership-scoped delete.
  await prisma.dividend.deleteMany({ where: { id, userId: session!.sub } });

  revalidatePath("/");
  redirect("/");
}
