BEGIN;

ALTER TYPE "SplatAssetStatus"
  ADD VALUE IF NOT EXISTS 'PROCESSING' BEFORE 'UPLOADED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'SplatReconstructionJobState'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "SplatReconstructionJobState" AS ENUM (
      'QUEUED',
      'GPU_STARTING',
      'RUNNING',
      'DONE',
      'FAILED'
    );
  END IF;
END
$$;

-- listingId/videoUrl/PROCESSING predate the orchestrator but were originally
-- provisioned with db push. Keep them here so a migration-only database reaches
-- the complete current SplatAsset shape as well.
ALTER TABLE "SplatAsset"
  ADD COLUMN IF NOT EXISTS "listingId" TEXT,
  ADD COLUMN IF NOT EXISTS "videoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "jobState" "SplatReconstructionJobState",
  ADD COLUMN IF NOT EXISTS "jobError" TEXT,
  ADD COLUMN IF NOT EXISTS "jobAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "jobCommandId" TEXT,
  ADD COLUMN IF NOT EXISTS "jobStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SplatAsset_listingId_idx"
  ON "SplatAsset"("listingId");

COMMIT;
