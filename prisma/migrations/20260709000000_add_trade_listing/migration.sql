-- CreateTable
CREATE TABLE "TradeListing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "tradeType" TEXT NOT NULL,
    "depositManwon" INTEGER NOT NULL DEFAULT 0,
    "monthlyRentManwon" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "floorPlan" JSONB,
    "status" TEXT NOT NULL DEFAULT '노출중',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeListing_status_createdAt_idx" ON "TradeListing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeListing_ownerId_idx" ON "TradeListing"("ownerId");
