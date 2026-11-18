"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { isValidSymbol, normalizeSymbol } from "@/lib/validation";

export async function createAlert(formData: FormData) {
  const user = await requireUser();

  const symbol = normalizeSymbol(formData.get("symbol"));
  const direction: "ABOVE" | "BELOW" =
    String(formData.get("direction")) === "BELOW" ? "BELOW" : "ABOVE";
  const priceStr = String(formData.get("targetPrice") ?? "").trim();
  const price = Number(priceStr);

  if (!isValidSymbol(symbol) || !Number.isFinite(price) || price <= 0) {
    redirect(
      "/alerts?error=" +
        encodeURIComponent("Enter a valid ticker and a target price above 0."),
    );
  }

  await prisma.alert.create({
    data: {
      userId: user.id,
      symbol,
      direction,
      targetPrice: new Prisma.Decimal(priceStr),
    },
  });

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function deleteAlert(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  await prisma.alert.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/alerts");
  redirect("/alerts");
}
