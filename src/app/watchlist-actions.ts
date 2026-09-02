"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export async function addWatch(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!SYMBOL_RE.test(symbol)) {
    redirect("/?werror=" + encodeURIComponent("Enter a valid ticker (e.g. AAPL)."));
  }

  try {
    await prisma.watchlistItem.create({
      data: { userId: session!.sub, symbol, note },
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
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  await prisma.watchlistItem.deleteMany({
    where: { id, userId: session!.sub },
  });

  revalidatePath("/");
  redirect("/");
}
