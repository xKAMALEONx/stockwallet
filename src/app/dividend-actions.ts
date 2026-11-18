"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { isValidSymbol, normalizeSymbol, parseMoney, parseDate } from "@/lib/validation";

// Read queries live in @/lib/dividends-source (server-only), not here.

export async function createDividend(formData: FormData) {
  const user = await requireUser();

  const symbol = normalizeSymbol(formData.get("symbol"));
  const note = String(formData.get("note") ?? "").trim();

  if (!isValidSymbol(symbol)) {
    redirect("/?derror=" + encodeURIComponent("Enter a valid ticker (e.g. AAPL)."));
  }
  const amount = parseMoney(formData.get("amount"), "Dividend amount");
  if (!amount.ok) {
    redirect("/?derror=" + encodeURIComponent(amount.error));
  }
  const paid = parseDate(formData.get("paidAt"));
  if (!paid.ok) {
    redirect("/?derror=" + encodeURIComponent(paid.error));
  }

  await prisma.dividend.create({
    data: {
      userId: user.id,
      symbol,
      amount: new Prisma.Decimal(amount.value),
      paidAt: paid.value,
      note: note || null,
    },
  });

  revalidatePath("/");
  redirect("/");
}

export async function deleteDividend(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  // Ownership-scoped delete.
  await prisma.dividend.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/");
  redirect("/");
}
