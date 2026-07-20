-- db push로만 반영되어 프로덕션 migrate deploy에서 누락되는 3D 자산 관련 컬럼 3개를 추가한다.
-- 개발 DB에는 이미 컬럼이 있을 수 있으므로 ADD COLUMN IF NOT EXISTS로 안전하게 보정한다.
BEGIN;

ALTER TABLE "TenantFurniture"
  ADD COLUMN IF NOT EXISTS "usdzUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "meshJobState" TEXT;

ALTER TABLE "SplatAsset"
  ADD COLUMN IF NOT EXISTS "captureFloorPlan" JSONB;

COMMIT;
