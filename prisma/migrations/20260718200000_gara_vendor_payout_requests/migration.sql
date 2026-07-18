CREATE TYPE "GaraVendorPayoutStatus" AS ENUM ('CREDIT_DEBITED');

CREATE TABLE "GaraVendorPayoutRequest" (
  "id" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "managerVendorId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "ledgerEntryId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "accountNumberSnapshot" TEXT NOT NULL,
  "status" "GaraVendorPayoutStatus" NOT NULL DEFAULT 'CREDIT_DEBITED',
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GaraVendorPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaraVendorPayoutRequest_ledgerEntryId_key"
  ON "GaraVendorPayoutRequest"("ledgerEntryId");
CREATE UNIQUE INDEX "GaraVendorPayoutRequest_idempotencyKey_key"
  ON "GaraVendorPayoutRequest"("idempotencyKey");
CREATE INDEX "GaraVendorPayoutRequest_managerId_createdAt_idx"
  ON "GaraVendorPayoutRequest"("managerId", "createdAt");
CREATE INDEX "GaraVendorPayoutRequest_managerVendorId_createdAt_idx"
  ON "GaraVendorPayoutRequest"("managerVendorId", "createdAt");
CREATE INDEX "GaraVendorPayoutRequest_vendorId_createdAt_idx"
  ON "GaraVendorPayoutRequest"("vendorId", "createdAt");

ALTER TABLE "GaraVendorPayoutRequest"
  ADD CONSTRAINT "GaraVendorPayoutRequest_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GaraVendorPayoutRequest_managerVendorId_fkey"
  FOREIGN KEY ("managerVendorId") REFERENCES "ManagerVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GaraVendorPayoutRequest_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GaraVendorPayoutRequest_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GaraVendorPayoutRequest_ledgerEntryId_fkey"
  FOREIGN KEY ("ledgerEntryId") REFERENCES "CreditLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
