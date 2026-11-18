"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { isValidSymbol, normalizeSymbol } from "@/lib/validation";
import { getQuoteData } from "@/lib/quotes";

const dec = (n: number | null) =>
  n != null && Number.isFinite(n) && n > 0 ? new Prisma.Decimal(n) : null;

const fail = (msg: string): never =>
  redirect("/journal?error=" + encodeURIComponent(msg));

// ── WATCH: dead-simple "keeping my eye on this" log ──────────────────
// Just a ticker and a one-line note. Nothing else required.
export async function logWatch(formData: FormData) {
  const user = await requireUser();

  const symbol = normalizeSymbol(formData.get("symbol"));
  const note = String(formData.get("note") ?? "").trim();

  if (!isValidSymbol(symbol)) fail("Enter a valid ticker (e.g. AAPL).");
  if (note.length < 2) fail("Add a short note — what caught your eye?");

  // Snapshot the price so a watch can still show drift since you flagged it.
  const q = await getQuoteData([symbol]).catch(() => ({}) as Record<string, { price: number }>);
  const price = q[symbol]?.price ?? null;

  await prisma.journalEntry.create({
    data: {
      userId: user.id,
      symbol,
      kind: "WATCH",
      note,
      entryPrice: dec(price),
    },
  });

  revalidatePath("/journal");
  redirect("/journal");
}

// ── PROJECTION: a tracked pick with the system's read baked in ───────
// The client computed rating/direction/conviction/target via /api/suggest and
// posts the chosen numbers here. We re-snapshot the live price as the entry so
// grading is measured from the moment of logging.
export async function logProjection(formData: FormData) {
  const user = await requireUser();

  const symbol = normalizeSymbol(formData.get("symbol"));
  const note = String(formData.get("note") ?? "").trim();
  const direction: "BULL" | "BEAR" =
    String(formData.get("direction")) === "BEAR" ? "BEAR" : "BULL";
  const convRaw = String(formData.get("conviction"));
  const conviction: "LOW" | "MEDIUM" | "HIGH" =
    convRaw === "LOW" || convRaw === "HIGH" ? convRaw : "MEDIUM";

  const targetNum = Number(String(formData.get("targetPrice") ?? ""));
  const horizonNum = Math.round(Number(String(formData.get("horizonYears") ?? "")));
  const cagrNum = Number(String(formData.get("projectedCagr") ?? ""));

  if (!isValidSymbol(symbol)) fail("Enter a valid ticker (e.g. AAPL).");
  if (!Number.isFinite(targetNum) || targetNum <= 0)
    fail("Pick a projection first so there's a target to track.");
  if (!Number.isFinite(horizonNum) || horizonNum < 1 || horizonNum > 30)
    fail("Set a horizon between 1 and 30 years.");

  const q = await getQuoteData([symbol]).catch(() => ({}) as Record<string, { price: number }>);
  const entryPrice = q[symbol]?.price ?? null;

  await prisma.journalEntry.create({
    data: {
      userId: user.id,
      symbol,
      kind: "PROJECTION",
      note: note || null,
      direction,
      conviction,
      entryPrice: dec(entryPrice),
      targetPrice: dec(targetNum),
      horizonYears: horizonNum,
      projectedCagr:
        Number.isFinite(cagrNum) ? new Prisma.Decimal(cagrNum) : null,
    },
  });

  revalidatePath("/journal");
  redirect("/journal");
}

export async function deleteEntry(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  await prisma.journalEntry.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/journal");
  redirect("/journal");
}
