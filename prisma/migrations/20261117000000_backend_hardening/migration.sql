-- Backend hardening (Alan review + Po second opinion):
--   * JournalEntry.targetHitNotifiedAt — stop repeat "target hit" spam (H1)
--   * Transaction.importKey + unique(accountId, importKey) — idempotent imports (M5)
--   * User.failedLogins / lockedUntil — login brute-force backoff (H2)
--   * User.lastTotpStep — TOTP replay protection (H2)
--   * User.sessionVersion — server-side session revocation (M3)
-- All additive and nullable/defaulted; safe on existing rows. Unique index
-- tolerates existing NULL importKey rows (Postgres treats NULLs as distinct).

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "targetHitNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastTotpStep" BIGINT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_importKey_key" ON "Transaction"("accountId", "importKey");
