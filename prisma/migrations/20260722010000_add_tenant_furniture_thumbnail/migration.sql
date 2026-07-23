-- 임차인 가구에 정사각 썸네일 이미지 URL을 붙인다. 없으면 프론트가 카테고리 아이콘으로 폴백한다.
BEGIN;

ALTER TABLE "TenantFurniture"
  ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;

COMMIT;
