CREATE TABLE "TenantComplaintDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "attachmentUrls" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantComplaintDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantComplaintDraft_tenantId_roomId_key"
ON "TenantComplaintDraft"("tenantId", "roomId");

CREATE INDEX "TenantComplaintDraft_expiresAt_idx"
ON "TenantComplaintDraft"("expiresAt");

ALTER TABLE "TenantComplaintDraft"
ADD CONSTRAINT "TenantComplaintDraft_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantComplaintDraft"
ADD CONSTRAINT "TenantComplaintDraft_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Complaint"
ADD COLUMN "clientRequestId" TEXT,
ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "Complaint_tenantId_clientRequestId_key"
ON "Complaint"("tenantId", "clientRequestId");
