DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractLifecycle') THEN
    CREATE TYPE "ContractLifecycle" AS ENUM ('UNREGISTERED', 'ANALYZING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractReview') THEN
    CREATE TYPE "ContractReview" AS ENUM ('PENDING', 'INFO_REQUESTED', 'CONFIRMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractDeletionState') THEN
    CREATE TYPE "ContractDeletionState" AS ENUM ('NONE', 'REQUESTED', 'COMPLETED', 'LIMITED', 'DENIED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractValueSource') THEN
    CREATE TYPE "ContractValueSource" AS ENUM ('CONFIRMED', 'MANUAL', 'UNVERIFIED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractDocumentOrigin') THEN
    CREATE TYPE "ContractDocumentOrigin" AS ENUM ('TENANT_UPLOAD', 'MANAGER_UPLOAD', 'MANUAL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Contract" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "tenantId" TEXT,
  "managerId" TEXT,
  "unitId" TEXT NOT NULL,
  "landlordName" TEXT NOT NULL,
  "lifecycle" "ContractLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "review" "ContractReview" NOT NULL DEFAULT 'PENDING',
  "deletion" "ContractDeletionState" NOT NULL DEFAULT 'NONE',
  "valueSource" "ContractValueSource" NOT NULL DEFAULT 'UNVERIFIED',
  "monthlyRent" INTEGER,
  "maintenanceFee" INTEGER,
  "paymentDay" INTEGER,
  "optionInventory" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "extractionId" TEXT,
  "documentId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedByManagerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractDocument" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "origin" "ContractDocumentOrigin" NOT NULL,
  "fileName" TEXT,
  "fileUrl" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractExtraction" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "highlights" TEXT[],
  "items" JSONB NOT NULL,
  "helpNotes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractExtraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractPrivacy" (
  "contractId" TEXT NOT NULL,
  "maskingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "retention" JSONB NOT NULL,
  "forwardingConsent" BOOLEAN NOT NULL DEFAULT false,
  "deletion" "ContractDeletionState" NOT NULL DEFAULT 'NONE',
  "deletionSlaHours" INTEGER,
  "deletable" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractPrivacy_pkey" PRIMARY KEY ("contractId")
);

CREATE TABLE IF NOT EXISTS "ContractInvite" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "inviteToken" TEXT NOT NULL,
  "invitedByManagerId" TEXT NOT NULL,
  "tenantName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "state" TEXT NOT NULL,
  "signupUrl" TEXT NOT NULL,
  "audit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  CONSTRAINT "ContractInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Contract_extractionId_key" ON "Contract"("extractionId");
CREATE INDEX IF NOT EXISTS "Contract_roomId_idx" ON "Contract"("roomId");
CREATE INDEX IF NOT EXISTS "Contract_tenantId_updatedAt_idx" ON "Contract"("tenantId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Contract_managerId_review_idx" ON "Contract"("managerId", "review");
CREATE INDEX IF NOT EXISTS "Contract_deletion_updatedAt_idx" ON "Contract"("deletion", "updatedAt");
CREATE INDEX IF NOT EXISTS "ContractDocument_contractId_uploadedAt_idx" ON "ContractDocument"("contractId", "uploadedAt");
CREATE INDEX IF NOT EXISTS "ContractDocument_uploadedByUserId_idx" ON "ContractDocument"("uploadedByUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractExtraction_contractId_key" ON "ContractExtraction"("contractId");
CREATE INDEX IF NOT EXISTS "ContractPrivacy_deletion_idx" ON "ContractPrivacy"("deletion");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractInvite_inviteToken_key" ON "ContractInvite"("inviteToken");
CREATE INDEX IF NOT EXISTS "ContractInvite_contractId_idx" ON "ContractInvite"("contractId");
CREATE INDEX IF NOT EXISTS "ContractInvite_invitedByManagerId_state_idx" ON "ContractInvite"("invitedByManagerId", "state");
CREATE INDEX IF NOT EXISTS "ContractInvite_roomId_idx" ON "ContractInvite"("roomId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contract_roomId_fkey') THEN
    ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractDocument_contractId_fkey') THEN
    ALTER TABLE "ContractDocument"
    ADD CONSTRAINT "ContractDocument_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractExtraction_contractId_fkey') THEN
    ALTER TABLE "ContractExtraction"
    ADD CONSTRAINT "ContractExtraction_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractPrivacy_contractId_fkey') THEN
    ALTER TABLE "ContractPrivacy"
    ADD CONSTRAINT "ContractPrivacy_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractInvite_contractId_fkey') THEN
    ALTER TABLE "ContractInvite"
    ADD CONSTRAINT "ContractInvite_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
