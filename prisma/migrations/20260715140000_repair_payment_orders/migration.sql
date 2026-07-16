ALTER TYPE "VendorPaymentRequestStatus"
  ADD VALUE 'TOSS_PAID' AFTER 'DIRECT_PAID';

ALTER TYPE "VendorPaymentAttemptMode"
  ADD VALUE 'TOSS' AFTER 'DIRECT';

ALTER TYPE "VendorPaymentAuditEventType"
  ADD VALUE 'TOSS_PAID' AFTER 'DIRECT_PAID';

CREATE TYPE "VendorPaymentPayerRole" AS ENUM (
  'MANAGER',
  'TENANT'
);

CREATE TYPE "RepairPaymentFlow" AS ENUM (
  'TOSS_ONE_TIME'
);

CREATE TYPE "RepairPaymentInitiator" AS ENUM (
  'USER_UI',
  'AI_AGENT',
  'SYSTEM_POLICY'
);

CREATE TYPE "RepairPaymentOrderStatus" AS ENUM (
  'READY',
  'CONFIRMING',
  'RECONCILIATION_REQUIRED',
  'APPROVED',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "VendorPaymentRequest"
  ADD COLUMN "payerRole" "VendorPaymentPayerRole",
  ADD COLUMN "payerUserId" TEXT;

UPDATE "VendorPaymentRequest"
SET
  "payerRole" = 'MANAGER'::"VendorPaymentPayerRole",
  "payerUserId" = "managerId";

ALTER TABLE "VendorPaymentRequest"
  ALTER COLUMN "payerRole" SET NOT NULL,
  ALTER COLUMN "payerUserId" SET NOT NULL;

CREATE INDEX "VendorPaymentRequest_payerRole_payerUserId_status_createdAt_idx"
  ON "VendorPaymentRequest"("payerRole", "payerUserId", "status", "createdAt");

ALTER TABLE "VendorPaymentRequest"
  ADD CONSTRAINT "VendorPaymentRequest_payerUserId_fkey"
  FOREIGN KEY ("payerUserId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RepairPaymentOrder" (
  "id" TEXT NOT NULL,
  "paymentRequestId" TEXT NOT NULL,
  "payerRole" "VendorPaymentPayerRole" NOT NULL,
  "payerUserId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "creationKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "openOrderKey" TEXT,
  "flow" "RepairPaymentFlow" NOT NULL DEFAULT 'TOSS_ONE_TIME',
  "amount" INTEGER NOT NULL,
  "status" "RepairPaymentOrderStatus" NOT NULL DEFAULT 'READY',
  "paymentKey" TEXT,
  "method" TEXT,
  "failureReason" TEXT,
  "returnPath" TEXT NOT NULL,
  "initiatedBy" "RepairPaymentInitiator" NOT NULL,
  "confirmationId" TEXT,
  "toolCallId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepairPaymentOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RepairPaymentOrder_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "RepairPaymentOrder_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RepairPaymentOrder_open_key_shape" CHECK (
    (
      "status" IN ('READY', 'CONFIRMING', 'RECONCILIATION_REQUIRED')
      AND "openOrderKey" IS NOT NULL
      AND "openOrderKey" = "paymentRequestId"
    )
    OR
    ("status" IN ('APPROVED', 'FAILED', 'CANCELLED') AND "openOrderKey" IS NULL)
  ),
  CONSTRAINT "RepairPaymentOrder_state_shape" CHECK (
    (
      "status" = 'READY'
      AND "paymentKey" IS NULL
      AND "method" IS NULL
      AND "failureReason" IS NULL
      AND "approvedAt" IS NULL
    ) OR (
      "status" = 'CONFIRMING'
      AND NULLIF(BTRIM("paymentKey"), '') IS NOT NULL
      AND "method" IS NULL
      AND "failureReason" IS NULL
      AND "approvedAt" IS NULL
    ) OR (
      "status" = 'RECONCILIATION_REQUIRED'
      AND NULLIF(BTRIM("paymentKey"), '') IS NOT NULL
      AND "method" IS NULL
      AND NULLIF(BTRIM("failureReason"), '') IS NOT NULL
      AND "approvedAt" IS NULL
    ) OR (
      "status" = 'APPROVED'
      AND NULLIF(BTRIM("paymentKey"), '') IS NOT NULL
      AND NULLIF(BTRIM("method"), '') IS NOT NULL
      AND "failureReason" IS NULL
      AND "approvedAt" IS NOT NULL
    ) OR (
      "status" = 'FAILED'
      AND ("paymentKey" IS NULL OR NULLIF(BTRIM("paymentKey"), '') IS NOT NULL)
      AND "method" IS NULL
      AND NULLIF(BTRIM("failureReason"), '') IS NOT NULL
      AND "approvedAt" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND ("paymentKey" IS NULL OR NULLIF(BTRIM("paymentKey"), '') IS NOT NULL)
      AND "method" IS NULL
      AND ("failureReason" IS NULL OR NULLIF(BTRIM("failureReason"), '') IS NOT NULL)
      AND "approvedAt" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "RepairPaymentOrder_orderId_key"
  ON "RepairPaymentOrder"("orderId");
CREATE UNIQUE INDEX "RepairPaymentOrder_creationKey_key"
  ON "RepairPaymentOrder"("creationKey");
CREATE UNIQUE INDEX "RepairPaymentOrder_paymentKey_key"
  ON "RepairPaymentOrder"("paymentKey");
CREATE UNIQUE INDEX "RepairPaymentOrder_openOrderKey_key"
  ON "RepairPaymentOrder"("openOrderKey");
CREATE INDEX "RepairPaymentOrder_paymentRequestId_status_updatedAt_idx"
  ON "RepairPaymentOrder"("paymentRequestId", "status", "updatedAt");
CREATE INDEX "RepairPaymentOrder_payerRole_payerUserId_status_updatedAt_idx"
  ON "RepairPaymentOrder"("payerRole", "payerUserId", "status", "updatedAt");

ALTER TABLE "RepairPaymentOrder"
  ADD CONSTRAINT "RepairPaymentOrder_paymentRequestId_fkey"
  FOREIGN KEY ("paymentRequestId") REFERENCES "VendorPaymentRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RepairPaymentOrder_payerUserId_fkey"
  FOREIGN KEY ("payerUserId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "assert_vendor_payment_request_payer_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_tenant_id TEXT;
BEGIN
  IF NEW."payerRole" = 'MANAGER'::"VendorPaymentPayerRole" THEN
    IF NEW."payerUserId" IS DISTINCT FROM NEW."managerId" THEN
      RAISE EXCEPTION 'Manager payment payer must match request manager';
    END IF;
  ELSIF NEW."payerRole" = 'TENANT'::"VendorPaymentPayerRole" THEN
    SELECT ticket."tenantId" INTO expected_tenant_id
    FROM "RepairRequest" AS repair
    JOIN "Ticket" AS ticket ON ticket."id" = repair."ticketId"
    WHERE repair."id" = NEW."repairId";

    IF expected_tenant_id IS NULL
      OR NEW."payerUserId" IS DISTINCT FROM expected_tenant_id THEN
      RAISE EXCEPTION 'Tenant payment payer must match repair ticket tenant';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported vendor payment payer role';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "VendorPaymentRequest_payer_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorPaymentRequest"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_payment_request_payer_consistency"();

CREATE OR REPLACE FUNCTION "protect_vendor_payment_request_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."repairId" IS DISTINCT FROM OLD."repairId"
    OR NEW."vendorId" IS DISTINCT FROM OLD."vendorId"
    OR NEW."managerId" IS DISTINCT FROM OLD."managerId"
    OR NEW."payerRole" IS DISTINCT FROM OLD."payerRole"
    OR NEW."payerUserId" IS DISTINCT FROM OLD."payerUserId"
    OR NEW."approvedEstimateId" IS DISTINCT FROM OLD."approvedEstimateId"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'VendorPaymentRequest identity is immutable';
  END IF;
  RETURN NEW;
END
$$;
