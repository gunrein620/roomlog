-- 직접등록 매물 상세 스펙(전용면적·층수·관리비) — 등록 폼 입력값이 상세 화면 "확인 중"으로 사라지던 문제 해소
ALTER TABLE "TradeListing" ADD COLUMN "exclusiveAreaM2" DOUBLE PRECISION;
ALTER TABLE "TradeListing" ADD COLUMN "floorInfo" TEXT;
ALTER TABLE "TradeListing" ADD COLUMN "maintenanceFeeManwon" INTEGER;
