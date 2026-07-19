ALTER TABLE "CreditTopupOrder" ADD COLUMN "garaManagerVendorId" TEXT;
ALTER TABLE "GaraVendorPayoutRequest" ADD COLUMN "topupOrderId" TEXT;
CREATE UNIQUE INDEX "GaraVendorPayoutRequest_topupOrderId_key"
  ON "GaraVendorPayoutRequest"("topupOrderId");
CREATE INDEX "CreditTopupOrder_garaManagerVendorId_status_idx"
  ON "CreditTopupOrder"("garaManagerVendorId", "status");
ALTER TABLE "CreditTopupOrder"
  ADD CONSTRAINT "CreditTopupOrder_garaManagerVendorId_fkey"
  FOREIGN KEY ("garaManagerVendorId") REFERENCES "ManagerVendor"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaraVendorPayoutRequest"
  ADD CONSTRAINT "GaraVendorPayoutRequest_topupOrderId_fkey"
  FOREIGN KEY ("topupOrderId") REFERENCES "CreditTopupOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
