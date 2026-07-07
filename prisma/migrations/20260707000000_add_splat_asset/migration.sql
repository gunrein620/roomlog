-- CreateEnum
CREATE TYPE "SplatAssetStatus" AS ENUM ('UPLOADED', 'REGISTERED', 'FAILED');

-- CreateTable
CREATE TABLE "SplatAsset" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "floorPlanId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileKind" TEXT NOT NULL DEFAULT 'spz',
    "sizeBytes" INTEGER,
    "status" "SplatAssetStatus" NOT NULL DEFAULT 'UPLOADED',
    "transform" JSONB,
    "registrationPairs" JSONB,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplatAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplatAsset_roomId_idx" ON "SplatAsset"("roomId");

-- CreateIndex
CREATE INDEX "SplatAsset_status_idx" ON "SplatAsset"("status");

-- AddForeignKey
ALTER TABLE "SplatAsset" ADD CONSTRAINT "SplatAsset_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplatAsset" ADD CONSTRAINT "SplatAsset_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
