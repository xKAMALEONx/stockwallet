"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getQuoteData } from "@/lib/quotes";

const SYMBOL_RE = /^[A-Z][A-Z.\-]{0,9}$/;

export async function createThesis(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const thesis = String(formData.get("thesis") ?? "").trim();
  const direction: "BULL" | "BEAR" =
    String(formData.get("direction")) === "BEAR" ? "BEAR" : "BULL";
  const convRaw = String(formData.get("conviction"));
  const conviction: "LOW" | "MEDIUM" | "HIGH" =
    convRaw === "LOW" || convRaw === "HIGH" ? convRaw : "MEDIUM";
  const targetRaw = String(formData.get("targetPrice") ?? "").trim();
  const timeframeRaw = String(formData.get("timeframe") ?? "").trim();

  if (!SYMBOL_RE.test(symbol) || thesis.length < 3) {
    redirect(
      "/journal?error=" +
        encodeURIComponent("Enter a valid ticker and a few words of thesis."),
    );
  }

  // Snapshot the current price so we can measure the move later.
  const q = await getQuoteData([symbol]);
  const entryPrice = q[symbol]?.price ?? null;

  const targetNum = targetRaw ? Number(targetRaw) : null;
  const timeframe = timeframeRaw ? new Date(timeframeRaw) : null;

  await prisma.journalEntry.create({
    data: {
      userId: session!.sub,
      symbol,
      thesis,
      direction,
      conviction,
      entryPrice: entryPrice != null ? new Prisma.Decimal(entryPrice) : null,
      targetPrice:
        targetNum != null && Number.isFinite(targetNum) && targetNum > 0
          ? new Prisma.Decimal(targetNum)
          : null,
      timeframe:
        timeframe && !Number.isNaN(timeframe.getTime()) ? timeframe : null,
    },
  });

  revalidatePath("/journal");
  redirect("/journal");
}

export async function gradeThesis(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const verdict: "RIGHT" | "WRONG" =
    String(formData.get("verdict")) === "RIGHT" ? "RIGHT" : "WRONG";

  await prisma.journalEntry.updateMany({
    where: { id, userId: session!.sub },
    data: { verdict, status: "CLOSED", resolvedAt: new Date() },
  });

  revalidatePath("/journal");
  redirect("/journal");
}

export async function reopenThesis(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  await prisma.journalEntry.updateMany({
    where: { id, userId: session!.sub },
    data: { verdict: null, status: "OPEN", resolvedAt: null },
  });

  revalidatePath("/journal");
  redirect("/journal");
}

export async function deleteThesis(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  await prisma.journalEntry.deleteMany({ where: { id, userId: session!.sub } });

  revalidatePath("/journal");
  redirect("/journal");
}
