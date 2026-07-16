BEGIN;

CREATE TYPE "CreditLedgerEntryType" AS ENUM (
  'OPENING_BALANCE',
  'TOPUP',
  'AUTO_DEBIT',
  'MANUAL_DEBIT',
  'REVERSAL'
);

CREATE TYPE "CreditTopupOrderStatus" AS ENUM (
  'READY',
  'CONFIRMING',
  'RECONCILIATION_REQUIRED',
  'APPROVED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "AutoPayPolicyMode" AS ENUM (
  'ALWAYS_REQUIRE_APPROVAL',
  'AUTO_DEBIT_UNDER_LIMIT'
);

CREATE TYPE "VendorPaymentAttemptStatus" AS ENUM (
  'STARTED',
  'SUCCEEDED',
  'INSUFFICIENT_CREDIT',
  'FAILED'
);

CREATE TYPE "VendorPaymentCommandType" AS ENUM (
  'CREDIT_REVERSAL',
  'DIRECT_VOID',
  'PAYMENT_CANCEL'
);

CREATE TABLE "CreditAccount" (
  "id" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "balance" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditAccount_balance_nonnegative" CHECK ("balance" >= 0),
  CONSTRAINT "CreditAccount_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "CreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "type" "CreditLedgerEntryType" NOT NULL,
  "signedAmount" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reversesLedgerEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditLedgerEntry_sign_by_type" CHECK (
    (
      "type" IN ('OPENING_BALANCE', 'TOPUP')
      AND "signedAmount" > 0
      AND "reversesLedgerEntryId" IS NULL
    ) OR (
      "type" IN ('AUTO_DEBIT', 'MANUAL_DEBIT')
      AND "signedAmount" < 0
      AND "reversesLedgerEntryId" IS NULL
    ) OR (
      "type" = 'REVERSAL'
      AND "signedAmount" > 0
      AND "reversesLedgerEntryId" IS NOT NULL
    )
  ),
  CONSTRAINT "CreditLedgerEntry_balance_after_nonnegative" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "CreditLedgerEntry_reference_nonblank" CHECK (
    NULLIF(BTRIM("referenceType"), '') IS NOT NULL
    AND NULLIF(BTRIM("referenceId"), '') IS NOT NULL
    AND NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
  )
);

CREATE TABLE "CreditTopupOrder" (
  "id" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "creationKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "CreditTopupOrderStatus" NOT NULL DEFAULT 'READY',
  "paymentKey" TEXT,
  "method" TEXT,
  "failureReason" TEXT,
  "returnPath" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditTopupOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditTopupOrder_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CreditTopupOrder_identity_nonblank" CHECK (
    NULLIF(BTRIM("orderId"), '') IS NOT NULL
    AND NULLIF(BTRIM("creationKey"), '') IS NOT NULL
    AND NULLIF(BTRIM("returnPath"), '') IS NOT NULL
  ),
  CONSTRAINT "CreditTopupOrder_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CreditTopupOrder_state_shape" CHECK (
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
      AND NULLIF(BTRIM("failureReason"), '') IS NOT NULL
      AND "approvedAt" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "paymentKey" IS NULL
      AND "method" IS NULL
      AND "approvedAt" IS NULL
    )
  )
);

CREATE TABLE "AutoPayPolicy" (
  "id" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "mode" "AutoPayPolicyMode" NOT NULL DEFAULT 'ALWAYS_REQUIRE_APPROVAL',
  "perRequestLimit" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoPayPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutoPayPolicy_mode_limit_shape" CHECK (
    (
      "mode" = 'ALWAYS_REQUIRE_APPROVAL'
      AND "perRequestLimit" IS NULL
    ) OR (
      "mode" = 'AUTO_DEBIT_UNDER_LIMIT'
      AND "perRequestLimit" > 0
    )
  )
);

CREATE TABLE "VendorPaymentAttempt" (
  "id" TEXT NOT NULL,
  "paymentRequestId" TEXT NOT NULL,
  "completionDecisionId" TEXT,
  "mode" "VendorPaymentAttemptMode" NOT NULL,
  "status" "VendorPaymentAttemptStatus" NOT NULL DEFAULT 'STARTED',
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "ledgerEntryId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "VendorPaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorPaymentAttempt_identity_nonblank" CHECK (
    NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
    AND NULLIF(BTRIM("actorUserId"), '') IS NOT NULL
  ),
  CONSTRAINT "VendorPaymentAttempt_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "VendorPaymentAttempt_state_shape" CHECK (
    (
      "status" = 'STARTED'
      AND "ledgerEntryId" IS NULL
      AND "failureReason" IS NULL
      AND "completedAt" IS NULL
    ) OR (
      "status" = 'SUCCEEDED'
      AND "failureReason" IS NULL
      AND "completedAt" IS NOT NULL
      AND (
        ("mode" IN ('AUTO_CREDIT', 'MANUAL_CREDIT') AND "ledgerEntryId" IS NOT NULL)
        OR ("mode" = 'DIRECT' AND "ledgerEntryId" IS NULL)
      )
    ) OR (
      "status" IN ('INSUFFICIENT_CREDIT', 'FAILED')
      AND "ledgerEntryId" IS NULL
      AND NULLIF(BTRIM("failureReason"), '') IS NOT NULL
      AND "completedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "VendorPaymentCommandReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "paymentRequestId" TEXT NOT NULL,
  "commandType" "VendorPaymentCommandType" NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resultStatus" "VendorPaymentRequestStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorPaymentCommandReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorPaymentCommandReceipt_key_nonblank" CHECK (
    NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
  ),
  CONSTRAINT "VendorPaymentCommandReceipt_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "CreditAccount_managerId_key"
  ON "CreditAccount"("managerId");
CREATE UNIQUE INDEX "CreditAccount_id_managerId_key"
  ON "CreditAccount"("id", "managerId");

CREATE UNIQUE INDEX "CreditLedgerEntry_idempotencyKey_key"
  ON "CreditLedgerEntry"("idempotencyKey");
CREATE UNIQUE INDEX "CreditLedgerEntry_reversesLedgerEntryId_key"
  ON "CreditLedgerEntry"("reversesLedgerEntryId");
CREATE INDEX "CreditLedgerEntry_creditAccountId_createdAt_idx"
  ON "CreditLedgerEntry"("creditAccountId", "createdAt");
CREATE INDEX "CreditLedgerEntry_referenceType_referenceId_idx"
  ON "CreditLedgerEntry"("referenceType", "referenceId");
CREATE UNIQUE INDEX "CreditLedgerEntry_one_opening_per_account"
  ON "CreditLedgerEntry"("creditAccountId")
  WHERE "type" = 'OPENING_BALANCE';
CREATE UNIQUE INDEX "CreditLedgerEntry_one_debit_per_payment_request"
  ON "CreditLedgerEntry"("referenceId")
  WHERE "referenceType" = 'VENDOR_PAYMENT_REQUEST'
    AND "type" IN ('AUTO_DEBIT', 'MANUAL_DEBIT');

CREATE UNIQUE INDEX "CreditTopupOrder_orderId_key"
  ON "CreditTopupOrder"("orderId");
CREATE UNIQUE INDEX "CreditTopupOrder_creationKey_key"
  ON "CreditTopupOrder"("creationKey");
CREATE UNIQUE INDEX "CreditTopupOrder_paymentKey_key"
  ON "CreditTopupOrder"("paymentKey");
CREATE INDEX "CreditTopupOrder_managerId_status_updatedAt_idx"
  ON "CreditTopupOrder"("managerId", "status", "updatedAt");

CREATE UNIQUE INDEX "AutoPayPolicy_managerId_key"
  ON "AutoPayPolicy"("managerId");

CREATE UNIQUE INDEX "VendorPaymentAttempt_idempotencyKey_key"
  ON "VendorPaymentAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "VendorPaymentAttempt_ledgerEntryId_key"
  ON "VendorPaymentAttempt"("ledgerEntryId");
CREATE INDEX "VendorPaymentAttempt_paymentRequestId_createdAt_idx"
  ON "VendorPaymentAttempt"("paymentRequestId", "createdAt");
CREATE UNIQUE INDEX "VendorPaymentAttempt_one_success_per_request"
  ON "VendorPaymentAttempt"("paymentRequestId")
  WHERE "status" = 'SUCCEEDED';
CREATE UNIQUE INDEX "VendorPaymentAttempt_one_auto_per_decision"
  ON "VendorPaymentAttempt"("paymentRequestId", "completionDecisionId")
  WHERE "mode" = 'AUTO_CREDIT' AND "completionDecisionId" IS NOT NULL;

CREATE UNIQUE INDEX "VendorPaymentCommandReceipt_idempotencyKey_key"
  ON "VendorPaymentCommandReceipt"("idempotencyKey");
CREATE INDEX "VendorPaymentCommandReceipt_paymentRequestId_createdAt_idx"
  ON "VendorPaymentCommandReceipt"("paymentRequestId", "createdAt");

CREATE UNIQUE INDEX "VendorPaymentRequest_ledgerEntryId_key"
  ON "VendorPaymentRequest"("ledgerEntryId");

ALTER TABLE "CreditAccount"
  ADD CONSTRAINT "CreditAccount_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry"
  ADD CONSTRAINT "CreditLedgerEntry_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CreditLedgerEntry_reversesLedgerEntryId_fkey"
  FOREIGN KEY ("reversesLedgerEntryId") REFERENCES "CreditLedgerEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditTopupOrder"
  ADD CONSTRAINT "CreditTopupOrder_creditAccountId_managerId_fkey"
  FOREIGN KEY ("creditAccountId", "managerId")
  REFERENCES "CreditAccount"("id", "managerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoPayPolicy"
  ADD CONSTRAINT "AutoPayPolicy_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorPaymentAttempt"
  ADD CONSTRAINT "VendorPaymentAttempt_paymentRequestId_fkey"
  FOREIGN KEY ("paymentRequestId") REFERENCES "VendorPaymentRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VendorPaymentAttempt_completionDecisionId_fkey"
  FOREIGN KEY ("completionDecisionId") REFERENCES "RepairCompletionDecision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VendorPaymentAttempt_ledgerEntryId_fkey"
  FOREIGN KEY ("ledgerEntryId") REFERENCES "CreditLedgerEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorPaymentCommandReceipt"
  ADD CONSTRAINT "VendorPaymentCommandReceipt_paymentRequestId_fkey"
  FOREIGN KEY ("paymentRequestId") REFERENCES "VendorPaymentRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorPaymentRequest"
  ADD CONSTRAINT "VendorPaymentRequest_ledgerEntryId_fkey"
  FOREIGN KEY ("ledgerEntryId") REFERENCES "CreditLedgerEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "guard_credit_ledger_reversal"()
RETURNS TRIGGER AS $$
DECLARE
  original "CreditLedgerEntry"%ROWTYPE;
BEGIN
  IF NEW."type" <> 'REVERSAL'::"CreditLedgerEntryType" THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original
  FROM "CreditLedgerEntry"
  WHERE "id" = NEW."reversesLedgerEntryId"
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit reversal source does not exist';
  END IF;
  IF original."creditAccountId" IS DISTINCT FROM NEW."creditAccountId" THEN
    RAISE EXCEPTION 'Credit reversal must use the original account';
  END IF;
  IF original."type" NOT IN ('AUTO_DEBIT', 'MANUAL_DEBIT') THEN
    RAISE EXCEPTION 'Only a payment debit can be reversed';
  END IF;
  IF NEW."signedAmount" IS DISTINCT FROM -original."signedAmount" THEN
    RAISE EXCEPTION 'Credit reversal amount must exactly negate the debit';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CreditLedgerEntry_reversal_guard"
  BEFORE INSERT ON "CreditLedgerEntry"
  FOR EACH ROW
  EXECUTE FUNCTION "guard_credit_ledger_reversal"();

CREATE OR REPLACE FUNCTION "guard_credit_ledger_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CreditLedgerEntry is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CreditLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "CreditLedgerEntry"
  FOR EACH ROW
  EXECUTE FUNCTION "guard_credit_ledger_append_only"();

COMMIT;
