-- Switch auth model: drop NextAuth/OAuth adapter tables, reshape User for
-- username + password + TOTP. Tables are empty, so new NOT NULL columns are safe.

-- DropTable (OAuth adapter tables)
DROP TABLE "Account";
DROP TABLE "Session";
DROP TABLE "VerificationToken";

-- AlterTable User: drop OAuth columns (dropping "email" also drops its unique index),
-- add credentials + TOTP columns.
ALTER TABLE "User"
  DROP COLUMN "email",
  DROP COLUMN "emailVerified",
  DROP COLUMN "image",
  DROP COLUMN "name",
  ADD COLUMN  "username" TEXT NOT NULL,
  ADD COLUMN  "passwordHash" TEXT NOT NULL,
  ADD COLUMN  "totpSecret" TEXT,
  ADD COLUMN  "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
