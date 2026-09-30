import "server-only";
import { prisma } from "@/lib/prisma";

/** All entries, newest first — caller splits by kind. */
export function listJournal(userId: string) {
  return prisma.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
