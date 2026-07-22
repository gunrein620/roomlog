#!/usr/bin/env bash
# schema.prisma ↔ 마이그레이션 원장 드리프트 검사.
#
# 왜: 로컬은 `db push`(스키마 직행), 프로덕션은 `migrate deploy`(마이그레이션 파일만 재생)라서
# schema.prisma에 필드를 넣고 마이그레이션 파일을 안 만들면 로컬은 되고 프로드만 깨진다 —
# Prisma 클라이언트가 없는 컬럼을 SELECT해서 관련 API가 전부 500. 이미 4번 반복된 사고
# (20260720000000_add_missing_asset_columns, 20260722000000_add_splat_asset_spawn_view 참고).
#
# 방법: 빈 DB에 실제 프로덕션 부트스트랩(apps/api/scripts/migrate-database.mjs = 동결 베이스라인
# + migrate deploy)을 돌린 뒤, 그 결과 DB를 schema.prisma와 `prisma migrate diff`로 비교한다.
# 차이가 있으면 실패 — "스키마엔 있는데 마이그레이션엔 없는" 변경이 프로드에 나가기 전에 잡힌다.
#
# 사용:
#   ROOMLOG_DRIFT_DATABASE_URL=postgresql://user:pass@host:port/dbname bash scripts/check-schema-drift.sh
#   (지정한 DB는 이 스크립트가 소유한다 — 매 실행마다 public 스키마를 DROP하므로 전용 DB만 줄 것.
#    미지정 시 로컬 docker postgres의 roomlog_driftcheck DB를 기본값으로 쓴다.)
set -euo pipefail

cd "$(dirname "$0")/.."

DRIFT_URL="${ROOMLOG_DRIFT_DATABASE_URL:-postgresql://roomlog:roomlog@localhost:5433/roomlog_driftcheck}"

# 대상 DB를 완전히 비운다 — 부트스트랩은 빈 DB 전제(비어있지 않으면 원장 검증에서 거부된다).
DBNAME="${DRIFT_URL##*/}"; DBNAME="${DBNAME%%\?*}"
MAINT_URL="${DRIFT_URL%/*}/postgres"
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$DBNAME\"" \
  || { echo "드리프트 검사용 DB($DBNAME)를 정리하지 못했습니다. ROOMLOG_DRIFT_DATABASE_URL이 전용 DB를 가리키는지 확인하세요." >&2; exit 1; }
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$DBNAME\""

echo "[1/2] 프로덕션 부트스트랩 재생(동결 베이스라인 + migrate deploy) → $DBNAME"
DATABASE_URL="$DRIFT_URL" node apps/api/scripts/migrate-database.mjs

echo "[2/2] 재생 결과 ↔ schema.prisma 비교"
set +e
DATABASE_URL="$DRIFT_URL" ./apps/api/node_modules/.bin/prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
status=$?
set -e

if [ "$status" -eq 2 ]; then
  cat >&2 <<'MSG'

✗ 스키마 드리프트 감지 — schema.prisma와 마이그레이션 재생 결과가 다릅니다.
  위 diff의 변경분을 담은 마이그레이션 파일을 prisma/migrations/에 추가하세요.
  (개발 DB에는 db push로 이미 반영돼 있을 수 있으니 ADD COLUMN IF NOT EXISTS 패턴 권장 —
   prisma/migrations/20260722000000_add_splat_asset_spawn_view/migration.sql 참고)
MSG
  exit 1
elif [ "$status" -ne 0 ]; then
  echo "✗ prisma migrate diff 실행 실패 (exit $status)" >&2
  exit "$status"
fi

echo "✓ 드리프트 없음 — schema.prisma와 마이그레이션 원장이 일치합니다."
