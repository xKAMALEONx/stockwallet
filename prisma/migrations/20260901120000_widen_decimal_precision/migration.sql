-- Widen numeric precision so crypto amounts/prices are stored exactly.
-- Non-destructive: existing values are preserved (scale is only increased).

ALTER TABLE "Transaction" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(28,10);
ALTER TABLE "Transaction" ALTER COLUMN "price" SET DATA TYPE DECIMAL(20,8);
ALTER TABLE "Transaction" ALTER COLUMN "fees" SET DATA TYPE DECIMAL(20,8);
