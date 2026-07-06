#!/usr/bin/env bash
# 룸로그 원커맨드 검증 — 도메인 머지/작업 후 상태 점검.
# 사용: bash scripts/verify.sh   (리포 루트에서)
# 통과 시 exit 0, 실패 시 첫 실패 지점에서 exit 1.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
FAIL=0
step() { echo ""; echo "▶ $1"; }
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; FAIL=1; }

step "1. types typecheck"
# @roomlog/types는 소스 export로 전환되어 build 스크립트가 없다 — typecheck로 검증.
pnpm --filter @roomlog/types typecheck >/tmp/rl_v_types.log 2>&1 && ok "types typecheck" || { bad "types typecheck (로그: /tmp/rl_v_types.log)"; }

step "2. ui typecheck"
pnpm --filter @roomlog/ui typecheck >/tmp/rl_v_ui.log 2>&1 && ok "ui typecheck" || bad "ui typecheck (/tmp/rl_v_ui.log)"

# 주의: web/api 패키지명은 스코프 없는 "web"/"api"다 — 스코프 필터를 쓰면 no-op으로 조용히 통과한다.
step "3. web 빌드"
pnpm --filter web build >/tmp/rl_v_web.log 2>&1 && ok "web build" || bad "web build (/tmp/rl_v_web.log)"

step "4. api 빌드"
pnpm --filter api build >/tmp/rl_v_api.log 2>&1 && ok "api build" || bad "api build (/tmp/rl_v_api.log)"

step "5. api 스모크 (health + listings + 통합 로그인 roles)"
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null
( cd apps/api && PORT=4000 node dist/main.js >/tmp/rl_v_apirun.log 2>&1 & )
for i in $(seq 1 20); do grep -q "listening" /tmp/rl_v_apirun.log 2>/dev/null && break; sleep 1; done
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health)
L=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/listings)
[ "$H" = "200" ] && ok "health 200" || bad "health=$H"
[ "$L" = "200" ] && ok "listings 200" || bad "listings=$L"
# 통합 로그인: 데모 multi-role 계정이 expectedRole 없이 로그인되고 파생 roles를 받는지.
AUTH=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"multi@roomlog.test","password":"password123!"}')
echo "$AUTH" | grep -q '"TENANT"' && echo "$AUTH" | grep -q '"LANDLORD"' \
  && ok "unified login roles(TENANT+LANDLORD)" || bad "unified login roles: $AUTH"
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null

echo ""
if [ "$FAIL" = "0" ]; then echo "✅ 전체 통과"; exit 0; else echo "❌ 실패 있음 — 위 로그 확인"; exit 1; fi
