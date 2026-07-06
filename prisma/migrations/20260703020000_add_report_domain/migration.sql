CREATE TYPE "ManagerReportPeriod" AS ENUM ('WEEK', 'MONTH', 'QUARTER');

CREATE TYPE "ManagerReportStatus" AS ENUM ('DRAFT', 'DELIVERED');

CREATE TYPE "ManagerReportSourceKind" AS ENUM ('BILLING', 'COMPLAINT', 'COST', 'UNIT', 'METRIC', 'CONTRACT', 'MOVEOUT', 'MESSAGING');

CREATE TYPE "ManagerReportShareStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TYPE "ManagerReportAuditAction" AS ENUM ('EXTERNAL_SHARE_CREATED', 'EXTERNAL_SHARE_VIEWED', 'EXTERNAL_SHARE_REVOKED');

CREATE TABLE "ManagerReport" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "period" "ManagerReportPeriod" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "ManagerReportStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "recipient" JSONB,
    "disclaimer" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextActions" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "linkedFollowUps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ManagerReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManagerReportSourceReference" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "sourceKind" "ManagerReportSourceKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "roomId" TEXT,
    "tenantId" TEXT,
    "label" TEXT NOT NULL,
    "drilldownScreenId" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReportSourceReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManagerReportExternalShare" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT true,
    "status" "ManagerReportShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByManagerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ManagerReportExternalShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManagerReportAuditLogEntry" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "shareId" TEXT,
    "action" "ManagerReportAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReportAuditLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagerReport_managerId_snapshotAt_idx" ON "ManagerReport"("managerId", "snapshotAt");

CREATE INDEX "ManagerReport_status_snapshotAt_idx" ON "ManagerReport"("status", "snapshotAt");

CREATE INDEX "ManagerReportSourceReference_reportId_sectionKey_idx" ON "ManagerReportSourceReference"("reportId", "sectionKey");

CREATE INDEX "ManagerReportSourceReference_sourceKind_entityType_entityId_idx" ON "ManagerReportSourceReference"("sourceKind", "entityType", "entityId");

CREATE INDEX "ManagerReportSourceReference_roomId_idx" ON "ManagerReportSourceReference"("roomId");

CREATE INDEX "ManagerReportSourceReference_tenantId_idx" ON "ManagerReportSourceReference"("tenantId");

CREATE UNIQUE INDEX "ManagerReportExternalShare_token_key" ON "ManagerReportExternalShare"("token");

CREATE INDEX "ManagerReportExternalShare_reportId_status_idx" ON "ManagerReportExternalShare"("reportId", "status");

CREATE INDEX "ManagerReportExternalShare_createdByManagerId_createdAt_idx" ON "ManagerReportExternalShare"("createdByManagerId", "createdAt");

CREATE INDEX "ManagerReportAuditLogEntry_reportId_createdAt_idx" ON "ManagerReportAuditLogEntry"("reportId", "createdAt");

CREATE INDEX "ManagerReportAuditLogEntry_shareId_createdAt_idx" ON "ManagerReportAuditLogEntry"("shareId", "createdAt");

ALTER TABLE "ManagerReportSourceReference"
ADD CONSTRAINT "ManagerReportSourceReference_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerReportExternalShare"
ADD CONSTRAINT "ManagerReportExternalShare_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerReportAuditLogEntry"
ADD CONSTRAINT "ManagerReportAuditLogEntry_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
