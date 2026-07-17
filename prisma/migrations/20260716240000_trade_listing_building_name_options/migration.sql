-- 마이그레이션 전환 때 누락된 TradeListing 컬럼 보정(buildingName·options).
-- 이 컬럼들이 없으면 prisma client의 findMany가 실패해 trade 스토어가 JSON 폴백으로 부팅되고,
-- DB 프로젝션도 조용히 실패한다(2026-07-16 프로드에서 실제 발생).
ALTER TABLE "TradeListing" ADD COLUMN IF NOT EXISTS "buildingName" TEXT;
ALTER TABLE "TradeListing" ADD COLUMN IF NOT EXISTS "options" TEXT[] DEFAULT ARRAY[]::TEXT[];
