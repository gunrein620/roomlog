# 관리자 대리접수 Implementation Plan

> **For agentic workers:** 테스트 우선. git 조작 금지. 설계: `docs/superpowers/specs/2026-07-18-manager-proxy-intake-design.md`.
> **파일 소유권**: `apps/web/src/app/my/flows/**`(세입자탭 배지)는 Claude 직접 담당 — Codex는 수정하지 말 것. 세입자 계약은 `packages/types`까지만.

**Goal:** 관리자가 전화·문자·대면으로 받은 하자를 직접 폼으로 등록해 기존 파이프라인에 연결하는 입구(대리접수)를 api↔manager 화면에 만든다. AI 접수는 범위 밖.

## Global Constraints

- 새 흐름·새 상태 금지 — 기존 `createComplaintRecord` + `analyzeComplaint` 재사용, 새 소스채널 `MANAGER_PROXY`만 추가.
- 대리접수 티켓은 실세입자 tenantId 귀속(세입자탭 노출). 세입자 미연결 호실은 거부.
- 검증은 서버 강제. 세입자 개인정보는 호실·이름까지만.

---

### Task 1: 서비스 회귀 계약 (RED)

**Files:**
- Modify/Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

- [ ] 대리접수: 실세입자 귀속 + `MANAGER_PROXY` 채널 + AI 분석 부착 + 관리자(LANDLORD) 발신 초기 메시지 + urgency 수동/AI 병합 실패 테스트.
- [ ] 게이트: 담당 아닌 호실 403, 세입자 미연결 호실 400 실패 테스트.
- [ ] 대리접수 티켓이 `listTicketsForManager`(관리자 목록)와 세입자 민원 조회 양쪽에 뜨는지 실패 테스트.
- [ ] transpile-only 단일 실행으로 RED 확인.

### Task 2: API·영속성 구현 (GREEN)

**Files:**
- Modify: `prisma/schema.prisma` (`ComplaintSourceChannel`에 `MANAGER_PROXY`)
- Create: `prisma/migrations/20260718xxxxxx_manager_proxy_source_channel/migration.sql` (`ALTER TYPE "ComplaintSourceChannel" ADD VALUE 'MANAGER_PROXY'`)
- Modify: `apps/api/src/roomlog/roomlog.types.ts` (`ManagerProxyIntakeInput`, `ComplaintSourceChannel` 유니온)
- Modify: `apps/api/src/roomlog/roomlog.service.ts` (`createManagerProxyIntake(managerId, input)` — 세입자 역방향 조회·게이트·`createComplaintRecord` 재사용; `listManagerProxyIntakeRooms(managerId)` — `resolveManagerBillingScope` 재사용)
- Modify: `apps/api/src/roomlog/roomlog.controller.ts` (`POST manager/tickets/proxy-intake`, `GET manager/proxy-intake/rooms` — LANDLORD 가드 + realtime broadcast)
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts` (MANAGER_PROXY 채널 load/persist 매핑 — enum이 문자열 그대로면 무변경일 수 있으니 확인)

- [ ] Task 1 GREEN. `node_modules/.bin/prisma generate` 실행. migration은 도커 postgres(`roomlog_migrated`)와 test DB(`roomlog_test`) 양쪽 적용.
- [ ] `ALTER TYPE ... ADD VALUE`는 트랜잭션 밖에서만 실행됨에 유의(마이그레이션 러너 확인).

### Task 3: 관리자 화면

**Files:**
- Modify: `apps/web/src/lib/ticket-manager-api.ts` (proxy-intake mutation, 호실 목록 조회)
- Create: `apps/web/src/app/manager/ticket/dash/00/actions.ts` (대리접수 서버 액션)
- Modify: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx` (헤더 "대리 접수" 버튼 + 폼 모달)
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx` (호실 목록 prefetch 필요 시)
- Modify/Test: 신규 `apps/web/src/app/manager/ticket/dash/00/proxy-intake.spec.ts` 소스 계약 스펙

- [ ] 웹 계약 스펙 RED → 구현 → GREEN: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/proxy-intake.spec.ts`
- [ ] 폼: 호실 선택·제목·내용·위치·발생시점·긴급도 4단계·방문가능시간·접수경로(전화/문자/대면)·사진. 서버 액션 경유. `my/flows` 미수정 자체 검토.

### Task 4: 세입자탭 배지 (Claude 직접 — Codex 제외)

**Files:**
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx` (상세 시트 `sourceChannel === "MANAGER_PROXY"` → "관리자 대리 접수" 배지)
- Modify: `apps/web/src/app/globals.css` (배지 스타일, 토큰만)

- [ ] Codex는 이 Task를 건너뛴다. Claude가 2C 병행 패턴처럼 직접 배선.

### Task 5: 통합 검증

- [ ] migration 적용(양 DB) 후 `prisma generate` 재확인.
- [ ] 대상 스펙 재실행(기존 실패 집합 외 신규 실패 0건).
- [ ] `bash scripts/verify.sh`. 도커 리빌드 후 E2E: 관리자 대리접수(전화) → 관리자 목록·세입자탭 이력 양쪽 노출 → AI 가능성 표시 → 책임확정/업체배정 연결 확인.
