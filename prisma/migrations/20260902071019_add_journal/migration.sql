-- CreateEnum
CREATE TYPE "Conviction" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ThesisDirection" AS ENUM ('BULL', 'BEAR');

-- CreateEnum
CREATE TYPE "ThesisStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('RIGHT', 'WRONG');

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "direction" "ThesisDirection" NOT NULL DEFAULT 'BULL',
    "entryPrice" DECIMAL(20,8),
    "targetPrice" DECIMAL(20,8),
    "timeframe" TIMESTAMP(3),
    "conviction" "Conviction" NOT NULL DEFAULT 'MEDIUM',
    "status" "ThesisStatus" NOT NULL DEFAULT 'OPEN',
    "verdict" "Verdict",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_userId_createdAt_idx" ON "JournalEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
