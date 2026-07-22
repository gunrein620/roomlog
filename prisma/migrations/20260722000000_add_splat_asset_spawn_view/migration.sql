-- db push로만 반영되어 프로덕션 migrate deploy에서 누락된 SplatAsset.spawnView를 추가한다.
-- (PR #159 feat(splat-tour): 자산별 투어 스폰 시점 저장 — schema.prisma에만 필드가 들어가고
--  마이그레이션이 없어서 프로드 DB에는 컬럼이 생기지 않았다. 20260720000000_add_missing_asset_columns와
--  같은 원인·같은 테이블의 재발이다.)
-- 개발 DB에는 이미 컬럼이 있을 수 있으므로 ADD COLUMN IF NOT EXISTS로 안전하게 보정한다.
BEGIN;

ALTER TABLE "SplatAsset"
  ADD COLUMN IF NOT EXISTS "spawnView" JSONB;

COMMIT;
