import "server-only";
import { prisma } from "@/lib/prisma";

export function listAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
