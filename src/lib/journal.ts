import "server-only";
import { prisma } from "@/lib/prisma";

export function listJournal(userId: string) {
  return prisma.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
