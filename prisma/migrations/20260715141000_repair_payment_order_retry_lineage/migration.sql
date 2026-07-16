ALTER TABLE "RepairPaymentOrder"
  ADD COLUMN "retryOfOrderId" TEXT;

CREATE INDEX "RepairPaymentOrder_retryOfOrderId_idx"
  ON "RepairPaymentOrder"("retryOfOrderId");

ALTER TABLE "RepairPaymentOrder"
  ADD CONSTRAINT "RepairPaymentOrder_retryOfOrderId_fkey"
  FOREIGN KEY ("retryOfOrderId") REFERENCES "RepairPaymentOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
