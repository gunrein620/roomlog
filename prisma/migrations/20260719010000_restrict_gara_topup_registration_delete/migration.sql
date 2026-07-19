ALTER TABLE "CreditTopupOrder"
  DROP CONSTRAINT "CreditTopupOrder_garaManagerVendorId_fkey";

ALTER TABLE "CreditTopupOrder"
  ADD CONSTRAINT "CreditTopupOrder_garaManagerVendorId_fkey"
  FOREIGN KEY ("garaManagerVendorId") REFERENCES "ManagerVendor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
