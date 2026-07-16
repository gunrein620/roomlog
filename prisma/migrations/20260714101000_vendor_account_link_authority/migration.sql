BEGIN;

-- A previous app version may still write the compatibility scalar after the
-- catalog migration commits. Backfill those last writes before removing it.
-- Taking this lock first makes an already-running legacy writer finish before
-- the snapshot below, and makes later writers wait until the column is gone.
LOCK TABLE "VendorProfile" IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "VendorAccountLink" ("id", "vendorId", "userId", "role", "status", "linkedAt")
SELECT
  'vendor-account-link:' || vendor."id",
  vendor."id",
  vendor."userId",
  'OWNER'::"VendorAccountRole",
  CASE
    WHEN
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
    THEN 'DISABLED'::"VendorAccountLinkStatus"
    ELSE 'ACTIVE'::"VendorAccountLinkStatus"
  END,
  CURRENT_TIMESTAMP
FROM "VendorProfile" AS vendor
INNER JOIN "UserAccount" AS account ON account."id" = vendor."userId"
WHERE vendor."userId" IS NOT NULL
  AND vendor."userId" NOT LIKE 'manual:%'
ON CONFLICT DO NOTHING;

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
    RAISE EXCEPTION 'Vendor authority cutover could not link every real compatibility account reference exactly once';
  END IF;
END
$$;

DROP INDEX "VendorProfile_userId_key";
ALTER TABLE "VendorProfile" DROP COLUMN "userId";

COMMIT;
