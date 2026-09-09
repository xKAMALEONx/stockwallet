-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "marketValue" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "dividendsTotal" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "spyPrice" DECIMAL(20,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_userId_date_idx" ON "PortfolioSnapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date");

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
