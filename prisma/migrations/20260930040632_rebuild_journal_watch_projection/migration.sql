-- CreateEnum
CREATE TYPE "JournalKind" AS ENUM ('WATCH', 'PROJECTION');

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "horizonYears" INTEGER,
ADD COLUMN     "kind" "JournalKind" NOT NULL DEFAULT 'PROJECTION',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "projectedCagr" DECIMAL(10,4),
ALTER COLUMN "thesis" DROP NOT NULL;
