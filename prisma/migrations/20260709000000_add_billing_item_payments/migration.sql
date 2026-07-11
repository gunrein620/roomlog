CREATE TYPE "BillLineItemKind" AS ENUM ('RENT', 'MAINTENANCE', 'OTHER');

CREATE TYPE "BillPaymentTransactionStatus" AS ENUM ('READY', 'APPROVED', 'FAILED');

ALTER TABLE "BillLineItem"
ADD COLUMN "kind" "BillLineItemKind" NOT NULL DEFAULT 'OTHER',
ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "BillLineItem"
SET "kind" = CASE
  WHEN "label" ILIKE '%월세%' OR "label" ILIKE '%임대료%' OR "label" ILIKE '%rent%' THEN 'RENT'::"BillLineItemKind"
  WHEN "label" ILIKE '%관리비%' OR "label" ILIKE '%maintenance%' THEN 'MAINTENANCE'::"BillLineItemKind"
  ELSE 'OTHER'::"BillLineItemKind"
END;

WITH ordered_items AS (
  SELECT
    line."id",
    line."amount",
    bill."paidAmount" AS "billPaidAmount",
    COALESCE(
      SUM(line."amount") OVER (
        PARTITION BY line."billId"
        ORDER BY
          CASE line."kind"
            WHEN 'RENT'::"BillLineItemKind" THEN 0
            WHEN 'MAINTENANCE'::"BillLineItemKind" THEN 1
            ELSE 2
          END,
          line."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS "priorAmount"
  FROM "BillLineItem" line
  JOIN "Bill" bill ON bill."id" = line."billId"
)
UPDATE "BillLineItem" line
SET "paidAmount" = GREATEST(
  0,
  LEAST(ordered_items."amount", ordered_items."billPaidAmount" - ordered_items."priorAmount")
)
FROM ordered_items
WHERE line."id" = ordered_items."id";

CREATE INDEX "BillLineItem_kind_idx" ON "BillLineItem"("kind");

CREATE TABLE "BillPaymentTransaction" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderName" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "itemKinds" "BillLineItemKind"[],
  "status" "BillPaymentTransactionStatus" NOT NULL DEFAULT 'READY',
  "paymentKey" TEXT,
  "method" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureMessage" TEXT,
  "rawResponse" JSONB,
  CONSTRAINT "BillPaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillPaymentAllocation" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "billLineItemId" TEXT NOT NULL,
  "kind" "BillLineItemKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "BillPaymentAllocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Deposit" ADD COLUMN "paymentTransactionId" TEXT;

CREATE UNIQUE INDEX "BillPaymentTransaction_orderId_key" ON "BillPaymentTransaction"("orderId");
CREATE INDEX "BillPaymentTransaction_billId_tenantId_idx" ON "BillPaymentTransaction"("billId", "tenantId");
CREATE INDEX "BillPaymentTransaction_status_idx" ON "BillPaymentTransaction"("status");
CREATE INDEX "BillPaymentAllocation_transactionId_idx" ON "BillPaymentAllocation"("transactionId");
CREATE INDEX "BillPaymentAllocation_billLineItemId_idx" ON "BillPaymentAllocation"("billLineItemId");
CREATE INDEX "Deposit_paymentTransactionId_idx" ON "Deposit"("paymentTransactionId");

ALTER TABLE "BillPaymentTransaction"
ADD CONSTRAINT "BillPaymentTransaction_billId_fkey"
FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillPaymentAllocation"
ADD CONSTRAINT "BillPaymentAllocation_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "BillPaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillPaymentAllocation"
ADD CONSTRAINT "BillPaymentAllocation_billLineItemId_fkey"
FOREIGN KEY ("billLineItemId") REFERENCES "BillLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deposit"
ADD CONSTRAINT "Deposit_paymentTransactionId_fkey"
FOREIGN KEY ("paymentTransactionId") REFERENCES "BillPaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
