ALTER TABLE "TradeListing"
ADD COLUMN IF NOT EXISTS "buildingName" TEXT,
ADD COLUMN IF NOT EXISTS "options" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "TradeListing"
SET "options" = ARRAY[]::TEXT[]
WHERE "options" IS NULL;

ALTER TABLE "TradeListing"
ALTER COLUMN "options" SET NOT NULL;

WITH ranked AS (
  SELECT
    "tenantId",
    "roomId",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId"
      ORDER BY "createdAt" DESC, "roomId" DESC
    ) AS relation_rank
  FROM "TenantRoom"
)
DELETE FROM "TenantRoom" AS tenant_room
USING ranked
WHERE tenant_room."tenantId" = ranked."tenantId"
  AND tenant_room."roomId" = ranked."roomId"
  AND ranked.relation_rank > 1;

CREATE UNIQUE INDEX "TenantRoom_tenantId_key" ON "TenantRoom"("tenantId");
