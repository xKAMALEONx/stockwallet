import "server-only";
import { prisma } from "@/lib/prisma";

export function listWatchlist(userId: string) {
  return prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}
