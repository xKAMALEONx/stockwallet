import "server-only";
import { prisma } from "@/lib/prisma";

// Read-only dividend queries. Lives in a `server-only` module (NOT a "use server"
// action file) so it can't be registered as a callable RPC endpoint that takes
// an arbitrary userId. Callers pass the id from their own authenticated session.
export function listDividends(userId: string) {
  return prisma.dividend.findMany({
    where: { userId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
}
