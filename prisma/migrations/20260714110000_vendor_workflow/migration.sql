BEGIN;

-- Fail closed unless both vendor foundation migrations completed their
-- authority cut-over.  This migration intentionally does not know about the
-- Prisma migration ledger because the prototype also supports frozen-baseline
-- migration tests.
DO $$
BEGIN
  IF to_regclass('public."VendorAccountLink"') IS NULL THEN
    RAISE EXCEPTION 'Vendor workflow requires VendorAccountLink foundation table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'VendorProfile'
      AND column_name = 'userId'
  ) THEN
    RAISE EXCEPTION 'Vendor workflow requires VendorProfile.userId authority cut-over';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'VendorProfile'
      AND column_name = 'createdByManagerId'
  ) THEN
    RAISE EXCEPTION 'Vendor workflow requires legacy VendorProfile.createdByManagerId source';
  END IF;
END
$$;

-- Fence every legacy projector write surface before taking backfill snapshots,
-- dropping createdByManagerId, or selecting the one retained active repair.
LOCK TABLE "UserAccount", "Room", "VendorProfile", "RepairRequest", "Ticket", "Attachment"
  IN SHARE ROW EXCLUSIVE MODE;

-- CreateEnum
CREATE TYPE "AttachmentOrigin" AS ENUM ('USER_UPLOAD', 'LEGACY_COMPLETION_URL');

-- CreateEnum
CREATE TYPE "ManagerVendorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VendorEstimateResponseType" AS ENUM ('FIXED_ESTIMATE', 'VISIT_REQUIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "VendorEstimateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VISIT_SCHEDULED', 'DECLINED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VendorEstimateLineItemCategory" AS ENUM ('VISIT', 'LABOR', 'MATERIAL', 'LEGACY_TOTAL');

-- CreateEnum
CREATE TYPE "VendorWorkflowRecordOrigin" AS ENUM ('LIVE', 'LEGACY_MIGRATION');

-- CreateEnum
CREATE TYPE "RepairCompletionDecisionSource" AS ENUM ('MANAGER', 'LEGACY_MIGRATION');

-- CreateEnum
CREATE TYPE "RepairCompletionDecisionValue" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorPaymentRequestStatus" AS ENUM ('WAITING_COMPLETION', 'PENDING_APPROVAL', 'AUTO_PAID', 'MANUAL_CREDIT_PAID', 'DIRECT_PAID', 'INSUFFICIENT_CREDIT', 'CANCELLED', 'REVERSED', 'DIRECT_PAYMENT_VOIDED');

-- CreateEnum
CREATE TYPE "VendorPaymentAttemptMode" AS ENUM ('AUTO_CREDIT', 'MANUAL_CREDIT', 'DIRECT');

-- CreateEnum
CREATE TYPE "VendorPaymentAuditEventType" AS ENUM ('REQUESTED', 'COMPLETION_APPROVED', 'COMPLETION_REJECTED', 'PENDING_APPROVAL', 'INSUFFICIENT_CREDIT', 'AUTO_PAID', 'MANUAL_CREDIT_PAID', 'DIRECT_PAID', 'CREDIT_REVERSED', 'DIRECT_PAYMENT_VOIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DomainEventDeliveryConsumer" AS ENUM ('NOTIFICATION', 'CREDIT_EVALUATION');

-- CreateEnum
CREATE TYPE "DomainEventDeliveryState" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED');

-- CreateEnum
CREATE TYPE "RoomlogDomainEventType" AS ENUM ('VENDOR_JOB_ASSIGNED', 'VENDOR_ESTIMATE_SUBMITTED', 'VENDOR_ESTIMATE_REVISED', 'VENDOR_ESTIMATE_APPROVED', 'VENDOR_ESTIMATE_REVISION_REQUESTED', 'VENDOR_ESTIMATE_REJECTED', 'VENDOR_COMPLETION_SUBMITTED', 'VENDOR_PAYMENT_REQUEST_CREATED', 'VENDOR_COMPLETION_APPROVED', 'VENDOR_COMPLETION_REJECTED', 'VENDOR_PAYMENT_PENDING_APPROVAL', 'VENDOR_PAYMENT_PAID', 'VENDOR_PAYMENT_REVERSED', 'VENDOR_PAYMENT_CANCELLED', 'VENDOR_DIRECT_PAYMENT_VOIDED', 'VENDOR_PAYMENT_INSUFFICIENT_CREDIT', 'MANAGER_CREDIT_TOPUP_SUCCEEDED', 'MANAGER_CREDIT_TOPUP_FAILED');

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_uploadedBy_fkey";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "origin" "AttachmentOrigin" NOT NULL DEFAULT 'USER_UPLOAD',
ALTER COLUMN "uploadedBy" DROP NOT NULL;

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_origin_uploader_shape" CHECK (
  ("origin" = 'USER_UPLOAD' AND "uploadedBy" IS NOT NULL)
  OR (
    "origin" = 'LEGACY_COMPLETION_URL'
    AND "uploadedBy" IS NULL
    AND "category" = 'COMPLETION_PHOTO'
  )
);

-- CreateTable
CREATE TABLE "ManagerVendor" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "ManagerVendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "managerNote" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorEstimate" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "responseType" "VendorEstimateResponseType" NOT NULL,
    "status" "VendorEstimateStatus" NOT NULL,
    "origin" "VendorWorkflowRecordOrigin" NOT NULL DEFAULT 'LIVE',
    "visitAvailableAt" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "workDescription" TEXT,
    "declineReason" TEXT,
    "totalAmount" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByManagerId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorEstimate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorEstimate_version_positive" CHECK ("version" > 0),
    CONSTRAINT "VendorEstimate_duration_positive" CHECK ("estimatedDurationMinutes" IS NULL OR "estimatedDurationMinutes" > 0),
    CONSTRAINT "VendorEstimate_response_shape" CHECK (
      "origin" = 'LEGACY_MIGRATION'
      OR (
        "origin" = 'LIVE'
        AND (
          (
            "responseType" = 'FIXED_ESTIMATE'
            AND "status" IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED')
            AND NULLIF(BTRIM("workDescription"), '') IS NOT NULL
            AND "totalAmount" IS NOT NULL
            AND "totalAmount" > 0
            AND "visitAvailableAt" IS NULL
            AND "declineReason" IS NULL
            AND (
              ("status" = 'DRAFT' AND "submittedAt" IS NULL)
              OR "status" = 'WITHDRAWN'
              OR ("status" NOT IN ('DRAFT', 'WITHDRAWN') AND "submittedAt" IS NOT NULL)
            )
          ) OR (
            "responseType" = 'VISIT_REQUIRED'
            AND "status" IN ('DRAFT', 'SUBMITTED', 'VISIT_SCHEDULED', 'WITHDRAWN', 'SUPERSEDED')
            AND "visitAvailableAt" IS NOT NULL
            AND NULLIF(BTRIM("workDescription"), '') IS NOT NULL
            AND "declineReason" IS NULL
            AND "totalAmount" IS NULL
            AND (
              ("status" = 'DRAFT' AND "submittedAt" IS NULL)
              OR "status" = 'WITHDRAWN'
              OR ("status" NOT IN ('DRAFT', 'WITHDRAWN') AND "submittedAt" IS NOT NULL)
            )
          ) OR (
            "responseType" = 'DECLINED'
            AND "status" IN ('DRAFT', 'DECLINED', 'WITHDRAWN')
            AND NULLIF(BTRIM("declineReason"), '') IS NOT NULL
            AND "visitAvailableAt" IS NULL
            AND "workDescription" IS NULL
            AND "totalAmount" IS NULL
            AND (
              ("status" = 'DRAFT' AND "submittedAt" IS NULL)
              OR "status" = 'WITHDRAWN'
              OR ("status" = 'DECLINED' AND "submittedAt" IS NOT NULL)
            )
          )
        )
      )
    ),
    CONSTRAINT "VendorEstimate_review_shape" CHECK (
      (
        "status" IN ('APPROVED', 'REVISION_REQUESTED', 'REJECTED')
        AND (
          (
            "origin" = 'LIVE'
            AND "reviewedAt" IS NOT NULL
            AND "reviewedByManagerId" IS NOT NULL
            AND (
              "status" = 'APPROVED'
              OR NULLIF(BTRIM("reviewNote"), '') IS NOT NULL
            )
          ) OR (
            "origin" = 'LEGACY_MIGRATION'
            AND "reviewedByManagerId" IS NULL
          )
        )
      ) OR "status" NOT IN ('APPROVED', 'REVISION_REQUESTED', 'REJECTED')
    ),
    CONSTRAINT "VendorEstimate_approved_fixed_only" CHECK ("status" <> 'APPROVED' OR "responseType" = 'FIXED_ESTIMATE')
    ,CONSTRAINT "VendorEstimate_legacy_shape" CHECK (
      "origin" <> 'LEGACY_MIGRATION'
      OR (
        "responseType" = 'FIXED_ESTIMATE'
        AND "status" IN ('DRAFT', 'SUBMITTED', 'APPROVED')
        AND "totalAmount" IS NOT NULL
        AND "totalAmount" > 0
        AND "visitAvailableAt" IS NULL
        AND "declineReason" IS NULL
        AND "submittedAt" IS NULL
        AND "reviewedByManagerId" IS NULL
        AND ("status" = 'APPROVED' OR "reviewedAt" IS NULL)
      )
    )
);

-- CreateTable
CREATE TABLE "VendorEstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "category" "VendorEstimateLineItemCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "VendorEstimateLineItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorEstimateLineItem_description_nonblank" CHECK (NULLIF(BTRIM("description"), '') IS NOT NULL),
    CONSTRAINT "VendorEstimateLineItem_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "VendorEstimateLineItem_unitAmount_positive" CHECK ("unitAmount" > 0),
    CONSTRAINT "VendorEstimateLineItem_lineAmount_positive" CHECK ("lineAmount" > 0),
    CONSTRAINT "VendorEstimateLineItem_sortOrder_nonnegative" CHECK ("sortOrder" >= 0),
    CONSTRAINT "VendorEstimateLineItem_amount_exact" CHECK ("lineAmount"::BIGINT = "quantity"::BIGINT * "unitAmount"::BIGINT)
);

-- CreateTable
CREATE TABLE "VendorCompletionReport" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "origin" "VendorWorkflowRecordOrigin" NOT NULL DEFAULT 'LIVE',
    "workSummary" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorCompletionReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorCompletionReport_version_positive" CHECK ("version" > 0),
    CONSTRAINT "VendorCompletionReport_summary_nonblank" CHECK (NULLIF(BTRIM("workSummary"), '') IS NOT NULL),
    CONSTRAINT "VendorCompletionReport_submissionKey_nonblank" CHECK (NULLIF(BTRIM("submissionKey"), '') IS NOT NULL),
    CONSTRAINT "VendorCompletionReport_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$')
);

-- CreateTable
CREATE TABLE "VendorCompletionReportAttachment" (
    "completionReportId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "VendorCompletionReportAttachment_pkey" PRIMARY KEY ("completionReportId","attachmentId"),
    CONSTRAINT "VendorCompletionReportAttachment_sortOrder_nonnegative" CHECK ("sortOrder" >= 0)
);

-- CreateTable
CREATE TABLE "RepairCompletionDecision" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "completionReportId" TEXT NOT NULL,
    "managerId" TEXT,
    "source" "RepairCompletionDecisionSource" NOT NULL,
    "decision" "RepairCompletionDecisionValue" NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairCompletionDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RepairCompletionDecision_actor_shape" CHECK (
      ("source" = 'MANAGER' AND "managerId" IS NOT NULL)
      OR ("source" = 'LEGACY_MIGRATION' AND "managerId" IS NULL)
    ),
    CONSTRAINT "RepairCompletionDecision_rejection_note" CHECK (
      "decision" <> 'REJECTED' OR NULLIF(BTRIM("note"), '') IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "VendorPaymentRequest" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "approvedEstimateId" TEXT NOT NULL,
    "completionReportId" TEXT NOT NULL,
    "completionDecisionId" TEXT,
    "costId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "VendorPaymentRequestStatus" NOT NULL DEFAULT 'WAITING_COMPLETION',
    "failureReason" TEXT,
    "lastAttemptMode" "VendorPaymentAttemptMode",
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "VendorPaymentRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorPaymentRequest_amount_positive" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "VendorPaymentAuditEvent" (
    "id" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "type" "VendorPaymentAuditEventType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "decisionId" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPaymentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEventOutbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "type" "RoomlogDomainEventType" NOT NULL,
    "targetUserIds" TEXT[] NOT NULL,
    "vendorId" TEXT,
    "managerId" TEXT,
    "repairId" TEXT,
    "paymentRequestId" TEXT,
    "completionDecisionId" TEXT,
    "actorUserId" TEXT,
    "statusCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DomainEventOutbox_eventKey_nonblank" CHECK (NULLIF(BTRIM("eventKey"), '') IS NOT NULL),
    CONSTRAINT "DomainEventOutbox_payloadHash_sha256" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "DomainEventOutbox_statusCode_nonblank" CHECK (NULLIF(BTRIM("statusCode"), '') IS NOT NULL)
);

-- CreateTable
CREATE TABLE "DomainEventDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumer" "DomainEventDeliveryConsumer" NOT NULL,
    "state" "DomainEventDeliveryState" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "DomainEventDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DomainEventDelivery_attemptCount_nonnegative" CHECK ("attemptCount" >= 0),
    CONSTRAINT "DomainEventDelivery_state_shape" CHECK (
      (
        "state" = 'PENDING'
        AND "lockedAt" IS NULL
        AND "lockToken" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NULL
      ) OR (
        "state" = 'PROCESSING'
        AND "lockedAt" IS NOT NULL
        AND NULLIF(BTRIM("lockToken"), '') IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" > "lockedAt"
        AND "deliveredAt" IS NULL
      ) OR (
        "state" = 'DELIVERED'
        AND "lockedAt" IS NULL
        AND "lockToken" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NOT NULL
      )
    )
);

-- CreateIndex
CREATE INDEX "ManagerVendor_managerId_status_idx" ON "ManagerVendor"("managerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerVendor_managerId_vendorId_key" ON "ManagerVendor"("managerId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorEstimate_vendorId_status_idx" ON "VendorEstimate"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorEstimate_repairId_version_key" ON "VendorEstimate"("repairId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VendorEstimateLineItem_estimateId_sortOrder_key" ON "VendorEstimateLineItem"("estimateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCompletionReport_submissionKey_key" ON "VendorCompletionReport"("submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCompletionReport_repairId_version_key" ON "VendorCompletionReport"("repairId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCompletionReportAttachment_attachmentId_key" ON "VendorCompletionReportAttachment"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCompletionReportAttachment_completionReportId_sortOrd_key" ON "VendorCompletionReportAttachment"("completionReportId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RepairCompletionDecision_completionReportId_key" ON "RepairCompletionDecision"("completionReportId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentRequest_repairId_key" ON "VendorPaymentRequest"("repairId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentRequest_completionDecisionId_key" ON "VendorPaymentRequest"("completionDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentRequest_costId_key" ON "VendorPaymentRequest"("costId");

-- CreateIndex
CREATE INDEX "VendorPaymentRequest_managerId_status_createdAt_idx" ON "VendorPaymentRequest"("managerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VendorPaymentRequest_vendorId_status_createdAt_idx" ON "VendorPaymentRequest"("vendorId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentAuditEvent_dedupeKey_key" ON "VendorPaymentAuditEvent"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentAuditEvent_decisionId_key" ON "VendorPaymentAuditEvent"("decisionId");

-- CreateIndex
CREATE INDEX "VendorPaymentAuditEvent_paymentRequestId_createdAt_idx" ON "VendorPaymentAuditEvent"("paymentRequestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventOutbox_eventKey_key" ON "DomainEventOutbox"("eventKey");

-- CreateIndex
CREATE INDEX "DomainEventDelivery_consumer_state_availableAt_idx" ON "DomainEventDelivery"("consumer", "state", "availableAt");

-- CreateIndex
CREATE INDEX "DomainEventDelivery_consumer_state_leaseExpiresAt_idx" ON "DomainEventDelivery"("consumer", "state", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventDelivery_eventId_consumer_key" ON "DomainEventDelivery"("eventId", "consumer");

-- AddForeignKey
ALTER TABLE "ManagerVendor" ADD CONSTRAINT "ManagerVendor_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerVendor" ADD CONSTRAINT "ManagerVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEstimate" ADD CONSTRAINT "VendorEstimate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEstimate" ADD CONSTRAINT "VendorEstimate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEstimate" ADD CONSTRAINT "VendorEstimate_reviewedByManagerId_fkey" FOREIGN KEY ("reviewedByManagerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEstimateLineItem" ADD CONSTRAINT "VendorEstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "VendorEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCompletionReport" ADD CONSTRAINT "VendorCompletionReport_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCompletionReport" ADD CONSTRAINT "VendorCompletionReport_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCompletionReportAttachment" ADD CONSTRAINT "VendorCompletionReportAttachment_completionReportId_fkey" FOREIGN KEY ("completionReportId") REFERENCES "VendorCompletionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCompletionReportAttachment" ADD CONSTRAINT "VendorCompletionReportAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCompletionDecision" ADD CONSTRAINT "RepairCompletionDecision_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCompletionDecision" ADD CONSTRAINT "RepairCompletionDecision_completionReportId_fkey" FOREIGN KEY ("completionReportId") REFERENCES "VendorCompletionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCompletionDecision" ADD CONSTRAINT "RepairCompletionDecision_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_approvedEstimateId_fkey" FOREIGN KEY ("approvedEstimateId") REFERENCES "VendorEstimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_completionReportId_fkey" FOREIGN KEY ("completionReportId") REFERENCES "VendorCompletionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_completionDecisionId_fkey" FOREIGN KEY ("completionDecisionId") REFERENCES "RepairCompletionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentRequest" ADD CONSTRAINT "VendorPaymentRequest_costId_fkey" FOREIGN KEY ("costId") REFERENCES "Cost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentAuditEvent" ADD CONSTRAINT "VendorPaymentAuditEvent_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "VendorPaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentAuditEvent" ADD CONSTRAINT "VendorPaymentAuditEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "RepairCompletionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentAuditEvent" ADD CONSTRAINT "VendorPaymentAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "VendorPaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_completionDecisionId_fkey" FOREIGN KEY ("completionDecisionId") REFERENCES "RepairCompletionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventDelivery" ADD CONSTRAINT "DomainEventDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEventOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preflight manager relationships before creating FKs-backed ManagerVendor
-- rows.  Silent skipping would turn an old manager association into a phantom
-- or destroy it when the legacy column is dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "VendorProfile" AS vendor
    LEFT JOIN "UserAccount" AS manager ON manager."id" = vendor."createdByManagerId"
    WHERE vendor."createdByManagerId" IS NOT NULL
      AND manager."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor workflow cannot backfill orphan createdByManagerId';
  END IF;
END
$$;

INSERT INTO "ManagerVendor" (
  "id", "managerId", "vendorId", "status", "managerNote", "registeredAt", "updatedAt"
)
SELECT
  'legacy-manager-vendor:' || md5(vendor."createdByManagerId" || E'\x1f' || vendor."id"),
  vendor."createdByManagerId",
  vendor."id",
  'ACTIVE'::"ManagerVendorStatus",
  NULL,
  vendor."createdAt",
  vendor."updatedAt"
FROM "VendorProfile" AS vendor
WHERE vendor."createdByManagerId" IS NOT NULL;

DROP INDEX "VendorProfile_createdByManagerId_idx";
ALTER TABLE "VendorProfile" DROP COLUMN "createdByManagerId";

-- Snapshot the single retained active repair before creating any payment
-- artifacts.  Older non-final rows on the same ticket are history and must not
-- receive a WAITING_COMPLETION request just before being cancelled.
CREATE TEMP TABLE "_VendorWorkflowRetainedActiveRepair" ON COMMIT DROP AS
SELECT ranked."id"
FROM (
  SELECT
    repair."id",
    ROW_NUMBER() OVER (
      PARTITION BY repair."ticketId"
      ORDER BY repair."createdAt" DESC, repair."id" DESC
    ) AS position
  FROM "RepairRequest" AS repair
  WHERE repair."status" NOT IN ('COMPLETED', 'CANCELLED')
) AS ranked
WHERE ranked.position = 1;

-- Completed reports are vendor statements.  Missing date or summary cannot be
-- truthfully invented, so abort rather than manufacturing evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RepairRequest" AS repair
    WHERE repair."status" IN ('COMPLETION_REPORTED', 'COMPLETED')
      AND (
        repair."completedAt" IS NULL
        OR NULLIF(BTRIM(repair."completionNote"), '') IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Vendor workflow cannot backfill completion without date and nonblank summary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RepairRequest" AS repair
    INNER JOIN "Ticket" AS ticket ON ticket."id" = repair."ticketId"
    INNER JOIN "Room" AS room ON room."id" = ticket."roomId"
    LEFT JOIN "UserAccount" AS manager ON manager."id" = room."landlordId"
    INNER JOIN "_VendorWorkflowRetainedActiveRepair" AS retained ON retained."id" = repair."id"
    WHERE repair."status" = 'COMPLETION_REPORTED'
      AND repair."costBearer" = 'LANDLORD'
      AND repair."estimateAmount" > 0
      AND (
        repair."estimateApprovedAt" IS NOT NULL
        OR repair."status" IN ('ESTIMATE_APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETION_REPORTED', 'COMPLETED')
      )
      AND (room."landlordId" IS NULL OR manager."id" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Vendor workflow cannot backfill landlord payment without ticket room manager';
  END IF;
END
$$;

-- Every positive legacy amount becomes one immutable v1 total.  The explicit
-- LEGACY_TOTAL category prevents the old scalar from being misreported as
-- labor, material, or a visit fee.
INSERT INTO "VendorEstimate" (
  "id", "repairId", "vendorId", "version", "responseType", "status", "origin",
  "visitAvailableAt", "estimatedDurationMinutes", "workDescription", "declineReason",
  "totalAmount", "submittedAt", "reviewedAt", "reviewedByManagerId", "reviewNote",
  "createdAt", "updatedAt"
)
SELECT
  'legacy-estimate:' || repair."id" || ':v1',
  repair."id",
  repair."vendorId",
  1,
  'FIXED_ESTIMATE'::"VendorEstimateResponseType",
  CASE
    WHEN repair."estimateApprovedAt" IS NOT NULL
      OR repair."status" IN ('ESTIMATE_APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETION_REPORTED', 'COMPLETED')
      THEN 'APPROVED'::"VendorEstimateStatus"
    WHEN repair."status" = 'ESTIMATE_SUBMITTED'
      THEN 'SUBMITTED'::"VendorEstimateStatus"
    ELSE 'DRAFT'::"VendorEstimateStatus"
  END,
  'LEGACY_MIGRATION'::"VendorWorkflowRecordOrigin",
  NULL,
  NULL,
  NULLIF(BTRIM(repair."estimateDescription"), ''),
  NULL,
  repair."estimateAmount",
  NULL,
  repair."estimateApprovedAt",
  NULL,
  repair."estimateApprovalNote",
  repair."createdAt",
  repair."updatedAt"
FROM "RepairRequest" AS repair
WHERE repair."estimateAmount" > 0;

INSERT INTO "VendorEstimateLineItem" (
  "id", "estimateId", "category", "description", "quantity", "unitAmount", "lineAmount", "sortOrder"
)
SELECT
  'legacy-estimate-line:' || repair."id" || ':v1',
  'legacy-estimate:' || repair."id" || ':v1',
  'LEGACY_TOTAL'::"VendorEstimateLineItemCategory",
  '레거시 견적 총액(세부 분류 없음)',
  1,
  repair."estimateAmount",
  repair."estimateAmount",
  0
FROM "RepairRequest" AS repair
WHERE repair."estimateAmount" > 0;

-- Preserve duplicate URLs by source ordinality.  Legacy URL evidence has an
-- explicit origin and no fabricated uploader identity.
INSERT INTO "Attachment" (
  "id", "uploadedBy", "fileName", "fileUrl", "mimeType", "sizeBytes", "category", "origin", "createdAt"
)
SELECT
  'legacy-completion-attachment:' || repair."id" || ':' || photo.ordinality,
  NULL,
  COALESCE(
    NULLIF(REGEXP_REPLACE(SPLIT_PART(photo.url, '?', 1), '^.*/', ''), ''),
    'legacy-completion-' || photo.ordinality
  ),
  photo.url,
  'application/octet-stream',
  0,
  'COMPLETION_PHOTO'::"AttachmentCategory",
  'LEGACY_COMPLETION_URL'::"AttachmentOrigin",
  repair."completedAt"
FROM "RepairRequest" AS repair
CROSS JOIN LATERAL UNNEST(repair."completionPhotoUrls") WITH ORDINALITY AS photo(url, ordinality)
WHERE repair."status" IN ('COMPLETION_REPORTED', 'COMPLETED');

INSERT INTO "VendorCompletionReport" (
  "id", "repairId", "vendorId", "version", "origin", "workSummary", "completedAt",
  "submissionKey", "payloadHash", "submittedAt"
)
SELECT
  'legacy-completion:' || repair."id" || ':v1',
  repair."id",
  repair."vendorId",
  1,
  'LEGACY_MIGRATION'::"VendorWorkflowRecordOrigin",
  BTRIM(repair."completionNote"),
  repair."completedAt",
  'legacy:completion:' || repair."id" || ':v1',
  -- Canonical legacy input is the deterministic JSONB text of these four
  -- named fields; JSONB supplies stable key ordering and escaping.
  encode(
    sha256(
      convert_to(
        jsonb_build_object(
          'repairId', repair."id",
          'workSummary', BTRIM(repair."completionNote"),
          'completedAt', repair."completedAt",
          'attachmentUrls', to_jsonb(repair."completionPhotoUrls")
        )::TEXT,
        'UTF8'
      )
    ),
    'hex'
  ),
  repair."completedAt"
FROM "RepairRequest" AS repair
WHERE repair."status" IN ('COMPLETION_REPORTED', 'COMPLETED');

INSERT INTO "VendorCompletionReportAttachment" (
  "completionReportId", "attachmentId", "sortOrder"
)
SELECT
  'legacy-completion:' || repair."id" || ':v1',
  'legacy-completion-attachment:' || repair."id" || ':' || photo.ordinality,
  photo.ordinality - 1
FROM "RepairRequest" AS repair
CROSS JOIN LATERAL UNNEST(repair."completionPhotoUrls") WITH ORDINALITY AS photo(url, ordinality)
WHERE repair."status" IN ('COMPLETION_REPORTED', 'COMPLETED');

INSERT INTO "RepairCompletionDecision" (
  "id", "repairId", "completionReportId", "managerId", "source", "decision", "note", "decidedAt"
)
SELECT
  'legacy-completion-decision:' || repair."id" || ':v1',
  repair."id",
  'legacy-completion:' || repair."id" || ':v1',
  NULL,
  'LEGACY_MIGRATION'::"RepairCompletionDecisionSource",
  'APPROVED'::"RepairCompletionDecisionValue",
  NULL,
  repair."completedAt"
FROM "RepairRequest" AS repair
WHERE repair."status" = 'COMPLETED';

INSERT INTO "VendorPaymentRequest" (
  "id", "repairId", "vendorId", "managerId", "approvedEstimateId", "completionReportId",
  "completionDecisionId", "costId", "amount", "status", "failureReason", "lastAttemptMode",
  "ledgerEntryId", "createdAt", "processedAt"
)
SELECT
  'legacy-payment-request:' || repair."id",
  repair."id",
  repair."vendorId",
  room."landlordId",
  estimate."id",
  'legacy-completion:' || repair."id" || ':v1',
  NULL,
  NULL,
  estimate."totalAmount",
  'WAITING_COMPLETION'::"VendorPaymentRequestStatus",
  NULL,
  NULL,
  NULL,
  repair."completedAt",
  NULL
FROM "RepairRequest" AS repair
INNER JOIN "_VendorWorkflowRetainedActiveRepair" AS retained ON retained."id" = repair."id"
INNER JOIN "Ticket" AS ticket ON ticket."id" = repair."ticketId"
INNER JOIN "Room" AS room ON room."id" = ticket."roomId"
INNER JOIN "VendorEstimate" AS estimate
  ON estimate."repairId" = repair."id"
  AND estimate."status" = 'APPROVED'
WHERE repair."status" = 'COMPLETION_REPORTED'
  AND repair."costBearer" = 'LANDLORD';

INSERT INTO "VendorPaymentAuditEvent" (
  "id", "paymentRequestId", "type", "dedupeKey", "decisionId", "actorUserId", "note", "createdAt"
)
SELECT
  'legacy-payment-audit-requested:' || request."repairId",
  request."id",
  'REQUESTED'::"VendorPaymentAuditEventType",
  'legacy:payment-requested:' || request."repairId",
  NULL,
  NULL,
  NULL,
  request."createdAt"
FROM "VendorPaymentRequest" AS request;

-- Preserve every row, but retain only the deterministic newest active repair
-- for each ticket before enforcing the partial uniqueness guard.
UPDATE "RepairRequest" AS repair
SET
  "status" = 'CANCELLED'::"RepairStatus",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE repair."status" NOT IN ('COMPLETED', 'CANCELLED')
  AND NOT EXISTS (
    SELECT 1
    FROM "_VendorWorkflowRetainedActiveRepair" AS retained
    WHERE retained."id" = repair."id"
  );

UPDATE "Ticket" AS ticket
SET
  "assignedVendorId" = repair."vendorId",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "RepairRequest" AS repair
INNER JOIN "_VendorWorkflowRetainedActiveRepair" AS retained ON retained."id" = repair."id"
WHERE ticket."id" = repair."ticketId";

CREATE UNIQUE INDEX "one_active_repair_per_ticket"
  ON "RepairRequest" ("ticketId") WHERE "status" NOT IN ('COMPLETED','CANCELLED');
CREATE UNIQUE INDEX "one_submitted_estimate_per_repair"
  ON "VendorEstimate" ("repairId") WHERE "status" = 'SUBMITTED';
CREATE UNIQUE INDEX "one_approved_estimate_per_repair"
  ON "VendorEstimate" ("repairId") WHERE "status" = 'APPROVED';

-- Cross-aggregate identity checks prevent a valid foreign key from being
-- combined with a repair, vendor, report, estimate, or decision from another
-- job.
CREATE FUNCTION "assert_vendor_workflow_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  repair_vendor_id TEXT;
  report_repair_id TEXT;
  report_vendor_id TEXT;
  estimate_repair_id TEXT;
  estimate_vendor_id TEXT;
  estimate_status "VendorEstimateStatus";
  estimate_response_type "VendorEstimateResponseType";
  estimate_total_amount INTEGER;
  decision_repair_id TEXT;
  decision_report_id TEXT;
  decision_manager_id TEXT;
  decision_source "RepairCompletionDecisionSource";
  decision_value "RepairCompletionDecisionValue";
  request_repair_id TEXT;
  request_report_id TEXT;
  attachment_category "AttachmentCategory";
  attachment_origin "AttachmentOrigin";
  report_origin "VendorWorkflowRecordOrigin";
BEGIN
  IF TG_TABLE_NAME = 'VendorEstimate' THEN
    SELECT repair."vendorId" INTO repair_vendor_id
    FROM "RepairRequest" AS repair WHERE repair."id" = NEW."repairId";
    IF repair_vendor_id IS DISTINCT FROM NEW."vendorId" THEN
      RAISE EXCEPTION 'VendorEstimate repair/vendor mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'VendorCompletionReport' THEN
    SELECT repair."vendorId" INTO repair_vendor_id
    FROM "RepairRequest" AS repair WHERE repair."id" = NEW."repairId";
    IF repair_vendor_id IS DISTINCT FROM NEW."vendorId" THEN
      RAISE EXCEPTION 'VendorCompletionReport repair/vendor mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'VendorCompletionReportAttachment' THEN
    SELECT attachment."category", attachment."origin"
      INTO attachment_category, attachment_origin
    FROM "Attachment" AS attachment WHERE attachment."id" = NEW."attachmentId";
    SELECT report."origin" INTO report_origin
    FROM "VendorCompletionReport" AS report WHERE report."id" = NEW."completionReportId";
    IF attachment_category IS DISTINCT FROM 'COMPLETION_PHOTO'::"AttachmentCategory" THEN
      RAISE EXCEPTION 'Completion report attachment must be a completion photo';
    END IF;
    IF attachment_origin = 'LEGACY_COMPLETION_URL'::"AttachmentOrigin"
      AND report_origin IS DISTINCT FROM 'LEGACY_MIGRATION'::"VendorWorkflowRecordOrigin" THEN
      RAISE EXCEPTION 'Legacy completion URL cannot be attached to a live report';
    END IF;
  ELSIF TG_TABLE_NAME = 'RepairCompletionDecision' THEN
    SELECT report."repairId" INTO report_repair_id
    FROM "VendorCompletionReport" AS report WHERE report."id" = NEW."completionReportId";
    IF report_repair_id IS DISTINCT FROM NEW."repairId" THEN
      RAISE EXCEPTION 'RepairCompletionDecision repair/report mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'VendorPaymentRequest' THEN
    SELECT repair."vendorId" INTO repair_vendor_id
    FROM "RepairRequest" AS repair WHERE repair."id" = NEW."repairId";
    SELECT estimate."repairId", estimate."vendorId", estimate."status", estimate."responseType", estimate."totalAmount"
      INTO estimate_repair_id, estimate_vendor_id, estimate_status, estimate_response_type, estimate_total_amount
    FROM "VendorEstimate" AS estimate WHERE estimate."id" = NEW."approvedEstimateId";
    SELECT report."repairId", report."vendorId"
      INTO report_repair_id, report_vendor_id
    FROM "VendorCompletionReport" AS report WHERE report."id" = NEW."completionReportId";

    IF repair_vendor_id IS DISTINCT FROM NEW."vendorId"
      OR estimate_repair_id IS DISTINCT FROM NEW."repairId"
      OR estimate_vendor_id IS DISTINCT FROM NEW."vendorId"
      OR estimate_status IS DISTINCT FROM 'APPROVED'::"VendorEstimateStatus"
      OR estimate_response_type IS DISTINCT FROM 'FIXED_ESTIMATE'::"VendorEstimateResponseType"
      OR estimate_total_amount IS DISTINCT FROM NEW."amount"
      OR report_repair_id IS DISTINCT FROM NEW."repairId"
      OR report_vendor_id IS DISTINCT FROM NEW."vendorId" THEN
      RAISE EXCEPTION 'VendorPaymentRequest aggregate mismatch';
    END IF;

    IF NEW."completionDecisionId" IS NOT NULL THEN
      SELECT decision."repairId", decision."completionReportId", decision."managerId", decision."source", decision."decision"
        INTO decision_repair_id, decision_report_id, decision_manager_id, decision_source, decision_value
      FROM "RepairCompletionDecision" AS decision
      WHERE decision."id" = NEW."completionDecisionId";
      IF decision_repair_id IS DISTINCT FROM NEW."repairId"
        OR decision_report_id IS DISTINCT FROM NEW."completionReportId"
        OR decision_manager_id IS DISTINCT FROM NEW."managerId"
        OR decision_source IS DISTINCT FROM 'MANAGER'::"RepairCompletionDecisionSource"
        OR decision_value IS DISTINCT FROM 'APPROVED'::"RepairCompletionDecisionValue" THEN
        RAISE EXCEPTION 'VendorPaymentRequest decision mismatch';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'VendorPaymentAuditEvent' AND NEW."decisionId" IS NOT NULL THEN
    SELECT request."repairId", request."completionReportId"
      INTO request_repair_id, request_report_id
    FROM "VendorPaymentRequest" AS request WHERE request."id" = NEW."paymentRequestId";
    SELECT decision."repairId", decision."completionReportId"
      INTO decision_repair_id, decision_report_id
    FROM "RepairCompletionDecision" AS decision WHERE decision."id" = NEW."decisionId";
    IF request_repair_id IS DISTINCT FROM decision_repair_id
      OR request_report_id IS DISTINCT FROM decision_report_id THEN
      RAISE EXCEPTION 'VendorPaymentAuditEvent decision mismatch';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "VendorEstimate_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorEstimate"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();
CREATE TRIGGER "VendorCompletionReport_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorCompletionReport"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();
CREATE TRIGGER "VendorCompletionReportAttachment_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorCompletionReportAttachment"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();
CREATE TRIGGER "RepairCompletionDecision_consistency_guard"
BEFORE INSERT OR UPDATE ON "RepairCompletionDecision"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();
CREATE TRIGGER "VendorPaymentRequest_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorPaymentRequest"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();
CREATE TRIGGER "VendorPaymentAuditEvent_consistency_guard"
BEFORE INSERT OR UPDATE ON "VendorPaymentAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "assert_vendor_workflow_consistency"();

CREATE FUNCTION "protect_vendor_payment_request_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."repairId" IS DISTINCT FROM OLD."repairId"
    OR NEW."vendorId" IS DISTINCT FROM OLD."vendorId"
    OR NEW."managerId" IS DISTINCT FROM OLD."managerId"
    OR NEW."approvedEstimateId" IS DISTINCT FROM OLD."approvedEstimateId"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'VendorPaymentRequest identity is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "VendorPaymentRequest_identity_immutable"
BEFORE UPDATE ON "VendorPaymentRequest"
FOR EACH ROW EXECUTE FUNCTION "protect_vendor_payment_request_identity"();

-- Validate line-item ownership and totals at commit so a transaction may create
-- the estimate row and its items in either order without exposing an invalid
-- committed estimate.
CREATE FUNCTION "validate_vendor_estimate_aggregate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  estimate_id TEXT;
  old_estimate_id TEXT;
  new_estimate_id TEXT;
  estimate_row "VendorEstimate"%ROWTYPE;
  item_count INTEGER;
  item_total BIGINT;
  legacy_item_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'VendorEstimate' THEN
    IF TG_OP <> 'DELETE' THEN new_estimate_id := NEW."id"; END IF;
    IF TG_OP <> 'INSERT' THEN old_estimate_id := OLD."id"; END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN new_estimate_id := NEW."estimateId"; END IF;
    IF TG_OP <> 'INSERT' THEN old_estimate_id := OLD."estimateId"; END IF;
  END IF;

  FOR estimate_id IN
    SELECT DISTINCT candidate
    FROM (VALUES (old_estimate_id), (new_estimate_id)) AS affected(candidate)
    WHERE candidate IS NOT NULL
  LOOP
    SELECT * INTO estimate_row FROM "VendorEstimate" WHERE "id" = estimate_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT
      COUNT(*),
      COALESCE(SUM("lineAmount"::BIGINT), 0),
      COUNT(*) FILTER (WHERE "category" = 'LEGACY_TOTAL')
    INTO item_count, item_total, legacy_item_count
    FROM "VendorEstimateLineItem"
    WHERE "estimateId" = estimate_id;

    IF estimate_row."responseType" = 'FIXED_ESTIMATE' THEN
      IF item_count = 0 THEN
        RAISE EXCEPTION 'Fixed estimate requires line items';
      END IF;
      IF item_count > 0 AND (
        estimate_row."totalAmount" IS NULL
        OR estimate_row."totalAmount"::BIGINT <> item_total
      ) THEN
        RAISE EXCEPTION 'Fixed estimate total must equal line-item sum';
      END IF;
    ELSIF item_count <> 0 OR estimate_row."totalAmount" IS NOT NULL THEN
      RAISE EXCEPTION 'Non-fixed estimate cannot contain line items or total';
    END IF;

    IF estimate_row."origin" = 'LIVE' AND legacy_item_count <> 0 THEN
      RAISE EXCEPTION 'Live estimate cannot use LEGACY_TOTAL';
    END IF;
    IF estimate_row."origin" = 'LEGACY_MIGRATION'
      AND (item_count <> 1 OR legacy_item_count <> 1) THEN
      RAISE EXCEPTION 'Legacy estimate requires exactly one LEGACY_TOTAL';
    END IF;
  END LOOP;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "VendorEstimate_aggregate_guard"
AFTER INSERT OR UPDATE ON "VendorEstimate"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_vendor_estimate_aggregate"();
CREATE CONSTRAINT TRIGGER "VendorEstimateLineItem_aggregate_guard"
AFTER INSERT OR UPDATE OR DELETE ON "VendorEstimateLineItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_vendor_estimate_aggregate"();

CREATE FUNCTION "protect_payment_estimate_snapshot"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_estimate_id TEXT;
  new_estimate_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'VendorEstimate' THEN
    old_estimate_id := OLD."id";
    IF TG_OP <> 'DELETE' THEN new_estimate_id := NEW."id"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_estimate_id := OLD."estimateId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_estimate_id := NEW."estimateId"; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "VendorPaymentRequest" AS request
    WHERE request."approvedEstimateId" IN (old_estimate_id, new_estimate_id)
  ) THEN
    RAISE EXCEPTION 'Approved estimate snapshot is immutable after payment request';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER "VendorEstimate_payment_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "VendorEstimate"
FOR EACH ROW EXECUTE FUNCTION "protect_payment_estimate_snapshot"();
CREATE TRIGGER "VendorEstimateLineItem_payment_snapshot_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "VendorEstimateLineItem"
FOR EACH ROW EXECUTE FUNCTION "protect_payment_estimate_snapshot"();

CREATE FUNCTION "prevent_workflow_evidence_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable once inserted', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER "VendorCompletionReport_immutable"
BEFORE UPDATE OR DELETE ON "VendorCompletionReport"
FOR EACH ROW EXECUTE FUNCTION "prevent_workflow_evidence_mutation"();
CREATE TRIGGER "VendorCompletionReportAttachment_immutable"
BEFORE UPDATE OR DELETE ON "VendorCompletionReportAttachment"
FOR EACH ROW EXECUTE FUNCTION "prevent_workflow_evidence_mutation"();
CREATE TRIGGER "RepairCompletionDecision_immutable"
BEFORE UPDATE OR DELETE ON "RepairCompletionDecision"
FOR EACH ROW EXECUTE FUNCTION "prevent_workflow_evidence_mutation"();
CREATE TRIGGER "VendorPaymentAuditEvent_immutable"
BEFORE UPDATE OR DELETE ON "VendorPaymentAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_workflow_evidence_mutation"();
CREATE TRIGGER "DomainEventOutbox_immutable"
BEFORE UPDATE OR DELETE ON "DomainEventOutbox"
FOR EACH ROW EXECUTE FUNCTION "prevent_workflow_evidence_mutation"();

CREATE FUNCTION "protect_completion_evidence_attachment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "VendorCompletionReportAttachment" AS link
    WHERE link."attachmentId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Attachment is immutable after completion-report linkage';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER "Attachment_completion_evidence_immutable"
BEFORE UPDATE OR DELETE ON "Attachment"
FOR EACH ROW EXECUTE FUNCTION "protect_completion_evidence_attachment"();

CREATE FUNCTION "guard_domain_event_delivery"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_event "DomainEventOutbox"%ROWTYPE;
  request_manager_id TEXT;
  request_decision_id TEXT;
  request_repair_id TEXT;
  request_vendor_id TEXT;
  request_report_id TEXT;
  decision_manager_id TEXT;
  decision_repair_id TEXT;
  decision_report_id TEXT;
  decision_source "RepairCompletionDecisionSource";
  decision_value "RepairCompletionDecisionValue";
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."eventId" IS DISTINCT FROM OLD."eventId"
    OR NEW."consumer" IS DISTINCT FROM OLD."consumer"
  ) THEN
    RAISE EXCEPTION 'Domain event delivery identity is immutable';
  END IF;

  IF NEW."consumer" = 'CREDIT_EVALUATION' THEN
    SELECT * INTO parent_event
    FROM "DomainEventOutbox"
    WHERE "id" = NEW."eventId";

    IF NOT FOUND
      OR parent_event."type" IS DISTINCT FROM 'VENDOR_COMPLETION_APPROVED'::"RoomlogDomainEventType"
      OR parent_event."managerId" IS NULL
      OR parent_event."paymentRequestId" IS NULL
      OR parent_event."completionDecisionId" IS NULL
      OR parent_event."actorUserId" IS NULL
      OR parent_event."actorUserId" IS DISTINCT FROM parent_event."managerId" THEN
      RAISE EXCEPTION 'CREDIT_EVALUATION requires a complete manager-approved completion event';
    END IF;

    SELECT request."managerId", request."completionDecisionId", request."repairId", request."vendorId", request."completionReportId"
      INTO request_manager_id, request_decision_id, request_repair_id, request_vendor_id, request_report_id
    FROM "VendorPaymentRequest" AS request
    WHERE request."id" = parent_event."paymentRequestId";

    SELECT decision."managerId", decision."repairId", decision."completionReportId", decision."source", decision."decision"
      INTO decision_manager_id, decision_repair_id, decision_report_id, decision_source, decision_value
    FROM "RepairCompletionDecision" AS decision
    WHERE decision."id" = parent_event."completionDecisionId";

    IF request_manager_id IS DISTINCT FROM parent_event."managerId"
      OR request_repair_id IS DISTINCT FROM parent_event."repairId"
      OR request_vendor_id IS DISTINCT FROM parent_event."vendorId"
      OR decision_manager_id IS DISTINCT FROM parent_event."managerId"
      OR decision_repair_id IS DISTINCT FROM request_repair_id
      OR decision_report_id IS DISTINCT FROM request_report_id
      OR (request_decision_id IS NOT NULL AND request_decision_id IS DISTINCT FROM parent_event."completionDecisionId")
      OR decision_source IS DISTINCT FROM 'MANAGER'::"RepairCompletionDecisionSource"
      OR decision_value IS DISTINCT FROM 'APPROVED'::"RepairCompletionDecisionValue" THEN
      RAISE EXCEPTION 'CREDIT_EVALUATION parent entities do not match';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "DomainEventDelivery_guard"
BEFORE INSERT OR UPDATE ON "DomainEventDelivery"
FOR EACH ROW EXECUTE FUNCTION "guard_domain_event_delivery"();

COMMIT;
