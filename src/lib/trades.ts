import "server-only";
import { prisma } from "@/lib/prisma";

const DEFAULT_ACCOUNT = "Robinhood";

/** Every user gets one default brokerage account for now (multi-account later). */
export async function getOrCreateDefaultAccount(userId: string) {
  const existing = await prisma.account.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.account.create({
    data: { userId, name: DEFAULT_ACCOUNT },
  });
}

export async function listTransactions(accountId: string) {
  return prisma.transaction.findMany({
    where: { accountId },
    orderBy: [{ tradedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTransaction(accountId: string, id: string) {
  return prisma.transaction.findFirst({ where: { id, accountId } });
}
