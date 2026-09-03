"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export async function createAlert(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const direction: "ABOVE" | "BELOW" =
    String(formData.get("direction")) === "BELOW" ? "BELOW" : "ABOVE";
  const price = Number(String(formData.get("targetPrice") ?? "").trim());

  if (!SYMBOL_RE.test(symbol) || !Number.isFinite(price) || price <= 0) {
    redirect(
      "/alerts?error=" +
        encodeURIComponent("Enter a valid ticker and a target price above 0."),
    );
  }

  await prisma.alert.create({
    data: {
      userId: session!.sub,
      symbol,
      direction,
      targetPrice: new Prisma.Decimal(price),
    },
  });

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function deleteAlert(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  await prisma.alert.deleteMany({ where: { id, userId: session!.sub } });

  revalidatePath("/alerts");
  redirect("/alerts");
}
