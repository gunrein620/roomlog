CREATE TYPE "MoveoutSettlementStatus" AS ENUM ('ESTIMATE', 'REVIEWING', 'REVIEW_DONE', 'RE_REVIEW');

CREATE TYPE "MoveoutRecordSource" AS ENUM ('MOVEIN_PHOTO', 'DEFECT', 'REPAIR', 'PAYMENT', 'CHAT', 'CONTRACT');

CREATE TYPE "MoveoutWearVerdict" AS ENUM ('AGING_LIKELY', 'DAMAGE_POSSIBLE', 'UNCLEAR');

CREATE TYPE "MoveoutDeductionKind" AS ENUM ('UNPAID', 'REPAIR', 'RESTORATION', 'CLEANING');

CREATE TYPE "MoveoutChecklistCondition" AS ENUM ('NORMAL', 'AGING', 'DAMAGE_CHECK');

CREATE TYPE "MoveoutDisputeStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'ANSWERED', 'CONFIRMED', 'RE_DISPUTED', 'RESOLVED');

CREATE TYPE "MoveoutWearAdjustmentAction" AS ENUM ('KEEP', 'ADJUST', 'REINFORCE');

CREATE TABLE "MoveoutRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "contractId" TEXT,
    "unitId" TEXT NOT NULL,
    "leaseEndDate" TIMESTAMP(3),
    "depositAmount" INTEGER,
    "estimatedRefundMin" INTEGER,
    "estimatedRefundMax" INTEGER,
    "settlementStatus" "MoveoutSettlementStatus" NOT NULL DEFAULT 'ESTIMATE',
    "prepProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "messagingThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutRecord" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "source" "MoveoutRecordSource" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "wearVerdict" "MoveoutWearVerdict",
    "wearNote" TEXT,
    "moveinComparisonAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutChecklistItem" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "condition" "MoveoutChecklistCondition" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutSettlement" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "depositAmount" INTEGER NOT NULL,
    "refundMin" INTEGER NOT NULL,
    "refundMax" INTEGER NOT NULL,
    "status" "MoveoutSettlementStatus" NOT NULL DEFAULT 'ESTIMATE',
    "disclaimer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutDeduction" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "kind" "MoveoutDeductionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "estimatedMin" INTEGER NOT NULL,
    "estimatedMax" INTEGER NOT NULL,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "evidenceNote" TEXT NOT NULL,
    "source" "MoveoutRecordSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutDeduction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutDispute" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "targetItemId" TEXT,
    "targetLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MoveoutDisputeStatus" NOT NULL DEFAULT 'RECEIVED',
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "managerResponse" TEXT,
    "messagingThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutDisputeEvent" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "status" "MoveoutDisputeStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutDisputeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoveoutReportAuditEntry" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "recordItemId" TEXT NOT NULL,
    "action" "MoveoutWearAdjustmentAction" NOT NULL,
    "fromVerdict" "MoveoutWearVerdict",
    "toVerdict" "MoveoutWearVerdict",
    "evidenceNote" TEXT NOT NULL,
    "tenantNotified" BOOLEAN NOT NULL DEFAULT false,
    "managerName" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutReportAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoveoutRequest_tenantId_updatedAt_idx" ON "MoveoutRequest"("tenantId", "updatedAt");

CREATE INDEX "MoveoutRequest_roomId_settlementStatus_idx" ON "MoveoutRequest"("roomId", "settlementStatus");

CREATE INDEX "MoveoutRequest_contractId_idx" ON "MoveoutRequest"("contractId");

CREATE INDEX "MoveoutRecord_moveoutId_source_idx" ON "MoveoutRecord"("moveoutId", "source");

CREATE INDEX "MoveoutChecklistItem_moveoutId_idx" ON "MoveoutChecklistItem"("moveoutId");

CREATE UNIQUE INDEX "MoveoutSettlement_moveoutId_key" ON "MoveoutSettlement"("moveoutId");

CREATE INDEX "MoveoutDeduction_moveoutId_needsConfirmation_idx" ON "MoveoutDeduction"("moveoutId", "needsConfirmation");

CREATE INDEX "MoveoutDispute_moveoutId_status_idx" ON "MoveoutDispute"("moveoutId", "status");

CREATE INDEX "MoveoutDispute_slaBreached_slaDeadline_idx" ON "MoveoutDispute"("slaBreached", "slaDeadline");

CREATE INDEX "MoveoutDisputeEvent_disputeId_createdAt_idx" ON "MoveoutDisputeEvent"("disputeId", "createdAt");

CREATE INDEX "MoveoutReportAuditEntry_moveoutId_createdAt_idx" ON "MoveoutReportAuditEntry"("moveoutId", "createdAt");

CREATE INDEX "MoveoutReportAuditEntry_managerId_createdAt_idx" ON "MoveoutReportAuditEntry"("managerId", "createdAt");

ALTER TABLE "MoveoutRequest"
ADD CONSTRAINT "MoveoutRequest_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutRequest"
ADD CONSTRAINT "MoveoutRequest_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutRequest"
ADD CONSTRAINT "MoveoutRequest_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MoveoutRecord"
ADD CONSTRAINT "MoveoutRecord_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutChecklistItem"
ADD CONSTRAINT "MoveoutChecklistItem_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutSettlement"
ADD CONSTRAINT "MoveoutSettlement_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutDeduction"
ADD CONSTRAINT "MoveoutDeduction_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutDispute"
ADD CONSTRAINT "MoveoutDispute_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutDisputeEvent"
ADD CONSTRAINT "MoveoutDisputeEvent_disputeId_fkey"
FOREIGN KEY ("disputeId") REFERENCES "MoveoutDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoveoutReportAuditEntry"
ADD CONSTRAINT "MoveoutReportAuditEntry_moveoutId_fkey"
FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
