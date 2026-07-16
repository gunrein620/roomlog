BEGIN;

-- Catalog and account-link status types.
CREATE TYPE "VendorVerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'REJECTED');
CREATE TYPE "VendorAccountRole" AS ENUM ('OWNER');
CREATE TYPE "VendorAccountLinkStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "VendorActivationStatus" AS ENUM ('ISSUED', 'CLAIMED', 'EXPIRED', 'REVOKED');

-- Expand the stable VendorProfile row into the catalog without changing its id.
ALTER TABLE "VendorProfile"
  ADD COLUMN "businessNumber" TEXT,
  ADD COLUMN "trades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "serviceAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "VendorProfile"
SET "serviceAreas" = ARRAY["serviceArea"]::TEXT[];

CREATE TABLE "VendorAccountLink" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "VendorAccountRole" NOT NULL DEFAULT 'OWNER',
  "status" "VendorAccountLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorAccountLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorActivation" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "status" "VendorActivationStatus" NOT NULL DEFAULT 'ISSUED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedByUserId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorActivation_keyHash_key"
ON "VendorActivation"("keyHash");

CREATE INDEX "VendorAccountLink_vendorId_status_idx"
ON "VendorAccountLink"("vendorId", "status");

CREATE INDEX "VendorAccountLink_userId_status_idx"
ON "VendorAccountLink"("userId", "status");

CREATE INDEX "VendorActivation_vendorId_status_expiresAt_idx"
ON "VendorActivation"("vendorId", "status", "expiresAt");

CREATE INDEX "VendorActivation_claimedByUserId_idx"
ON "VendorActivation"("claimedByUserId");

ALTER TABLE "VendorAccountLink"
ADD CONSTRAINT "VendorAccountLink_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorAccountLink"
ADD CONSTRAINT "VendorAccountLink_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorActivation"
ADD CONSTRAINT "VendorActivation_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorActivation"
ADD CONSTRAINT "VendorActivation_claimedByUserId_fkey"
FOREIGN KEY ("claimedByUserId") REFERENCES "UserAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Real vendor-only users retain active access.
INSERT INTO "VendorAccountLink" ("id", "vendorId", "userId", "role", "status", "linkedAt")
SELECT
  'vendor-account-link:' || vendor."id",
  vendor."id",
  vendor."userId",
  'OWNER'::"VendorAccountRole",
  'ACTIVE'::"VendorAccountLinkStatus",
  CURRENT_TIMESTAMP
FROM "VendorProfile" AS vendor
INNER JOIN "UserAccount" AS account ON account."id" = vendor."userId"
WHERE vendor."userId" NOT LIKE 'manual:%'
  AND NOT (
    EXISTS (
      SELECT 1
      FROM "TenantRoom" AS tenant_room
      WHERE tenant_room."tenantId" = account."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "Room" AS managed_room
      WHERE managed_room."landlordId" = account."id"
    )
    OR account."role" IN ('TENANT', 'LANDLORD')
  );

-- Cross-role and stored TENANT/LANDLORD compatibility users are linked but disabled.
INSERT INTO "VendorAccountLink" ("id", "vendorId", "userId", "role", "status", "linkedAt")
SELECT
  'vendor-account-link:' || vendor."id",
  vendor."id",
  vendor."userId",
  'OWNER'::"VendorAccountRole",
  'DISABLED'::"VendorAccountLinkStatus",
  CURRENT_TIMESTAMP
FROM "VendorProfile" AS vendor
INNER JOIN "UserAccount" AS account ON account."id" = vendor."userId"
WHERE vendor."userId" NOT LIKE 'manual:%'
  AND (
    EXISTS (
      SELECT 1
      FROM "TenantRoom" AS tenant_room
      WHERE tenant_room."tenantId" = account."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "Room" AS managed_room
      WHERE managed_room."landlordId" = account."id"
    )
    OR account."role" IN ('TENANT', 'LANDLORD')
  );

-- Keep the legacy unique scalar as a nullable compatibility field for the runtime transition.
ALTER TABLE "VendorProfile"
ALTER COLUMN "userId" DROP NOT NULL;

UPDATE "VendorProfile"
SET
  "userId" = NULL,
  "verificationStatus" = 'PENDING'::"VendorVerificationStatus"
WHERE "userId" LIKE 'manual:%';

-- Abort the entire transaction if any real legacy account reference was not linked exactly once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "VendorProfile" AS vendor
    WHERE vendor."userId" IS NOT NULL
      AND vendor."userId" NOT LIKE 'manual:%'
      AND (
        SELECT COUNT(*)
        FROM "VendorAccountLink" AS account_link
        WHERE account_link."vendorId" = vendor."id"
          AND account_link."userId" = vendor."userId"
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'Vendor catalog migration could not link every real legacy account reference exactly once';
  END IF;
END
$$;

CREATE UNIQUE INDEX "VendorAccountLink_one_active_owner_per_vendor"
ON "VendorAccountLink" ("vendorId")
WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "VendorAccountLink_one_active_vendor_per_user"
ON "VendorAccountLink" ("userId")
WHERE "status" = 'ACTIVE';

COMMIT;
