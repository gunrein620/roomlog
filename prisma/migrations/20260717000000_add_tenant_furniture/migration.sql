-- 트랙 C: 임차인 가구 배치(TenantFurniture 인벤토리 + 매물별 배치안).
-- prisma migrate deploy가 자동 적용. IF NOT EXISTS로 idempotent(db push 선적용에도 안전).
BEGIN;

CREATE TABLE IF NOT EXISTS "TenantFurniture" (
    "id" TEXT NOT NULL,
    "ownerTenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "widthMm" INTEGER NOT NULL,
    "depthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "meshUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantFurniture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TenantFurniture_ownerTenantId_idx" ON "TenantFurniture"("ownerTenantId");

CREATE TABLE IF NOT EXISTS "TenantFurniturePlacement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantFurniturePlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantFurniturePlacement_tenantId_listingId_key" ON "TenantFurniturePlacement"("tenantId", "listingId");
CREATE INDEX IF NOT EXISTS "TenantFurniturePlacement_tenantId_idx" ON "TenantFurniturePlacement"("tenantId");

COMMIT;
