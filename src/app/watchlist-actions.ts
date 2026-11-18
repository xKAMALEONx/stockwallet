"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { isValidSymbol, normalizeSymbol } from "@/lib/validation";

export async function addWatch(formData: FormData) {
  const user = await requireUser();

  const symbol = normalizeSymbol(formData.get("symbol"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!isValidSymbol(symbol)) {
    redirect("/?werror=" + encodeURIComponent("Enter a valid ticker (e.g. AAPL)."));
  }

  try {
    await prisma.watchlistItem.create({
      data: { userId: user.id, symbol, note },
    });
  } catch (e) {
    // Unique constraint → already on the watchlist; ignore, just refresh.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      throw e;
    }
  }

  revalidatePath("/");
  redirect("/");
}

export async function removeWatch(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  await prisma.watchlistItem.deleteMany({
    where: { id, userId: user.id },
  });

  revalidatePath("/");
  redirect("/");
}
