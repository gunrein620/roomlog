-- RoomPlan 한 번의 스캔으로 생성된 가구에 같은 배치 ID를 기록해 잘못된 스캔 전체를 되돌릴 수 있게 한다.
-- 기존 행과 RoomPlan 외 출처는 배치가 없으므로 nullable 컬럼으로 추가하고 소유자별 배치 삭제용 인덱스를 만든다.
BEGIN;

ALTER TABLE "TenantFurniture"
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "TenantFurniture_ownerTenantId_importBatchId_idx"
  ON "TenantFurniture"("ownerTenantId", "importBatchId");

COMMIT;
