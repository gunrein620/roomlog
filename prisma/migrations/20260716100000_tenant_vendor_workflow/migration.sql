ALTER TYPE "RepairCompletionDecisionSource"
  ADD VALUE IF NOT EXISTS 'TENANT';

ALTER TABLE "VendorEstimate"
  ADD COLUMN IF NOT EXISTS "reviewedByTenantId" TEXT;

ALTER TABLE "RepairCompletionDecision"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

ALTER TABLE "VendorEstimate"
  DROP CONSTRAINT IF EXISTS "VendorEstimate_reviewedByTenantId_fkey";

ALTER TABLE "VendorEstimate"
  ADD CONSTRAINT "VendorEstimate_reviewedByTenantId_fkey"
  FOREIGN KEY ("reviewedByTenantId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepairCompletionDecision"
  DROP CONSTRAINT IF EXISTS "RepairCompletionDecision_tenantId_fkey";

ALTER TABLE "RepairCompletionDecision"
  ADD CONSTRAINT "RepairCompletionDecision_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorEstimate"
  DROP CONSTRAINT IF EXISTS "VendorEstimate_reviewer_shape";

ALTER TABLE "VendorEstimate"
  ADD CONSTRAINT "VendorEstimate_reviewer_shape"
  CHECK (
    NOT (
      "reviewedByManagerId" IS NOT NULL
      AND "reviewedByTenantId" IS NOT NULL
    )
  );

ALTER TABLE "VendorEstimate"
  DROP CONSTRAINT IF EXISTS "VendorEstimate_review_shape";

ALTER TABLE "VendorEstimate"
  ADD CONSTRAINT "VendorEstimate_review_shape"
  CHECK (
    (
      "status" IN ('APPROVED', 'REVISION_REQUESTED', 'REJECTED')
      AND (
        (
          "origin" = 'LIVE'
          AND "reviewedAt" IS NOT NULL
          AND (
            (
              "reviewedByManagerId" IS NOT NULL
              AND "reviewedByTenantId" IS NULL
            )
            OR (
              "reviewedByTenantId" IS NOT NULL
              AND "reviewedByManagerId" IS NULL
            )
          )
          AND (
            "status" = 'APPROVED'
            OR NULLIF(BTRIM("reviewNote"), '') IS NOT NULL
          )
        )
        OR (
          "origin" = 'LEGACY_MIGRATION'
          AND "reviewedByManagerId" IS NULL
          AND "reviewedByTenantId" IS NULL
        )
      )
    )
    OR "status" NOT IN ('APPROVED', 'REVISION_REQUESTED', 'REJECTED')
  );

ALTER TABLE "RepairCompletionDecision"
  DROP CONSTRAINT IF EXISTS "RepairCompletionDecision_actor_shape";

ALTER TABLE "RepairCompletionDecision"
  ADD CONSTRAINT "RepairCompletionDecision_actor_shape"
  CHECK (
    (
      "source"::text = 'MANAGER'
      AND "managerId" IS NOT NULL
      AND "tenantId" IS NULL
    )
    OR (
      "source"::text = 'TENANT'
      AND "managerId" IS NULL
      AND "tenantId" IS NOT NULL
    )
    OR (
      "source"::text = 'LEGACY_MIGRATION'
      AND "tenantId" IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS "VendorEstimate_reviewedByTenantId_status_idx"
  ON "VendorEstimate"("reviewedByTenantId", "status");

CREATE INDEX IF NOT EXISTS "RepairCompletionDecision_tenantId_decidedAt_idx"
  ON "RepairCompletionDecision"("tenantId", "decidedAt");
