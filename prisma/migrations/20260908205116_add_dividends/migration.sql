-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dividend_userId_symbol_idx" ON "Dividend"("userId", "symbol");

-- CreateIndex
CREATE INDEX "Dividend_userId_paidAt_idx" ON "Dividend"("userId", "paidAt");

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
