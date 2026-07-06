CREATE TYPE "CostType" AS ENUM ('REPAIR', 'MAINTENANCE', 'COMMON', 'OTHER');

CREATE TYPE "CostStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'AMENDED', 'VOID');

CREATE TYPE "CostAttributionScope" AS ENUM ('UNIT', 'BUILDING');

CREATE TYPE "DisclosureState" AS ENUM ('PUBLIC', 'PRIVATE');

CREATE TYPE "RepairPaymentState" AS ENUM ('ALREADY_PAID', 'UNPAID');

CREATE TYPE "CostReviewReason" AS ENUM ('OCR_LOW_CONFIDENCE', 'CLASSIFICATION_UNCLEAR', 'UNIT_UNMATCHED');

CREATE TYPE "ReceiptSource" AS ENUM ('CAMERA', 'FILE', 'ONLINE', 'MANUAL');

CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "managerId" TEXT,
    "source" "ReceiptSource" NOT NULL,
    "imageUrl" TEXT,
    "hasEvidence" BOOLEAN NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicateOfId" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "managerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "item" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CostType" NOT NULL,
    "scope" "CostAttributionScope" NOT NULL,
    "unitId" TEXT,
    "status" "CostStatus" NOT NULL DEFAULT 'DRAFT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" "CostReviewReason",
    "disclosure" "DisclosureState",
    "repairPayment" "RepairPaymentState",
    "paymentRef" TEXT,
    "receiptId" TEXT,
    "supersedesId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptOcr" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "costId" TEXT,
    "itemValue" TEXT NOT NULL,
    "itemConfidence" DOUBLE PRECISION NOT NULL,
    "itemNeedsReview" BOOLEAN NOT NULL,
    "dateValue" TEXT NOT NULL,
    "dateConfidence" DOUBLE PRECISION NOT NULL,
    "dateNeedsReview" BOOLEAN NOT NULL,
    "amountValue" INTEGER NOT NULL,
    "amountConfidence" DOUBLE PRECISION NOT NULL,
    "amountNeedsReview" BOOLEAN NOT NULL,
    "unitIdValue" TEXT,
    "unitIdConfidence" DOUBLE PRECISION,
    "unitIdNeedsReview" BOOLEAN,
    "suggestedType" "CostType",
    "typeConfidence" DOUBLE PRECISION,
    "lineItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptOcr_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Receipt_uploadedAt_idx" ON "Receipt"("uploadedAt");

CREATE INDEX "Receipt_managerId_idx" ON "Receipt"("managerId");

CREATE INDEX "Receipt_duplicateOfId_idx" ON "Receipt"("duplicateOfId");

CREATE INDEX "Cost_managerId_idx" ON "Cost"("managerId");

CREATE INDEX "Cost_status_date_idx" ON "Cost"("status", "date");

CREATE INDEX "Cost_type_date_idx" ON "Cost"("type", "date");

CREATE INDEX "Cost_receiptId_idx" ON "Cost"("receiptId");

CREATE INDEX "Cost_supersedesId_idx" ON "Cost"("supersedesId");

CREATE INDEX "ReceiptOcr_receiptId_idx" ON "ReceiptOcr"("receiptId");

CREATE INDEX "ReceiptOcr_costId_idx" ON "ReceiptOcr"("costId");

ALTER TABLE "Receipt"
ADD CONSTRAINT "Receipt_duplicateOfId_fkey"
FOREIGN KEY ("duplicateOfId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Cost"
ADD CONSTRAINT "Cost_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Cost"
ADD CONSTRAINT "Cost_supersedesId_fkey"
FOREIGN KEY ("supersedesId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReceiptOcr"
ADD CONSTRAINT "ReceiptOcr_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReceiptOcr"
ADD CONSTRAINT "ReceiptOcr_costId_fkey"
FOREIGN KEY ("costId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
