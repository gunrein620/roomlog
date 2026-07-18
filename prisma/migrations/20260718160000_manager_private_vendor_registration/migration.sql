ALTER TABLE "VendorProfile"
ADD COLUMN "createdByManagerId" TEXT;

ALTER TABLE "ManagerVendor"
ADD COLUMN "settlementAccountNumber" TEXT;

ALTER TABLE "VendorProfile"
ADD CONSTRAINT "VendorProfile_createdByManagerId_fkey"
FOREIGN KEY ("createdByManagerId") REFERENCES "UserAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "VendorProfile_createdByManagerId_idx"
ON "VendorProfile"("createdByManagerId");

CREATE UNIQUE INDEX "VendorProfile_createdByManagerId_phone_key"
ON "VendorProfile"("createdByManagerId", "phone");
