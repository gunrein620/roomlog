# 하자 흐름 2차분B Implementation Plan

> **For agentic workers:** 이 작업은 테스트 우선으로 실행한다. git 조작 단계는 없다. 설계 근거는 `docs/superpowers/specs/2026-07-17-defect-flow-phase-2b-design.md`.

**Goal:** 관리자 직접 처리 갈래(시작/완료 보고/취소 + 선택 비용기록)와 세입자 자가수리 트랙의 관리자 가시성(미등록 업체 읽기전용 조회·목록 배지·realtime)을 web↔api↔DB에 연결한다.

**Architecture:** in-memory Store + PrismaStoreProjector 패턴 유지. 직접 처리는 RepairRequest 없이 Ticket 메타·상태 전이만 사용. 자가수리 판별은 RepairRequest.tenantInitiated 컬럼으로 승격.

## Global Constraints

- git 명령·브랜치·커밋 금지.
- 상태·권한·충돌·필수값 검증은 서버에서 강제.
- CSS 색상은 `var(--...)` 토큰만.
- TicketStatus enum 확장 금지 — 기존 값 재사용.

---

### Task 1: 서비스 회귀 계약 (RED)

**Files:**
- Modify/Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

- [ ] 직접 처리: 시작(REPAIR_IN_PROGRESS 전이·메시지) → 완료 보고(COMPLETION_REPORTED·메시지·DRAFT Cost 생성) → 기존 `confirmTenantCompletion`으로 COMPLETED(수리 레코드 0개) 실패 테스트 추가.
- [ ] 게이트: 활성 수리 존재 시 시작 거부, 비직접 티켓 완료 보고 거부, note 공백 거부, cost 음수/0 거부, 취소 후 REVIEWING 복귀 실패 테스트 추가.
- [ ] transpile-only 단일 실행으로 RED 확인: `cd apps/api && TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register --test-name-pattern "direct" src/roomlog/roomlog.service.spec.ts`

### Task 2: API·영속성 구현 (GREEN)

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts` (Ticket.directHandling*, Repair.tenantInitiated, 입력 타입)
- Modify: `apps/api/src/roomlog/roomlog.service.ts` (직접 처리 3메서드 + presenter directHandling/selfRepair — `presentTicketForManager`는 5960행 부근)
- Modify: `apps/api/src/roomlog/roomlog.controller.ts` (직접 처리 3엔드포인트 + realtime broadcast, 자가수리 세입자 엔드포인트 broadcast 보강 — `vendor-connection/confirm` 844행, `estimates/:id/review` 870행, `confirm-visit` 887행, `completion-decisions` 904행 부근. 기존 broadcast 있으면 중복 금지)
- Modify: `prisma/schema.prisma` (Ticket 3컬럼, RepairRequest.tenantInitiated)
- Create: `prisma/migrations/20260717150000_ticket_direct_handling_self_repair/migration.sql` (컬럼 추가 + DomainEventOutbox 조인 백필)
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts` (load/create/update 매핑)
- Modify: `apps/api/src/roomlog/prisma-tenant-vendor-connection.repository.ts` (repairRequest.create에 tenantInitiated: true — 210행 부근)
- Modify: `apps/api/src/roomlog/prisma-manager-vendor.repository.ts` (`findJobByTicket` 431행 부근 — relation 없을 때 UNREGISTERED 축약 뷰)
- Modify: `apps/api/src/roomlog/services/roomlog-manager-vendor.domain.ts` (147행 부근 반환 계약)
- Modify/Test: `apps/api/src/roomlog/prisma-store-projector.spec.ts` (새 필드 round-trip)
- Modify/Test: `apps/api/src/roomlog/roomlog.controller-realtime.spec.ts` (직접 처리 시작·완료 broadcast)

- [ ] Task 1 테스트 GREEN.
- [ ] projector round-trip·realtime 테스트 GREEN (DB 스펙은 `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test`).
- [ ] `node_modules/.bin/prisma generate` 실행.

### Task 3: 공유 타입·웹 배선

**Files:**
- Modify: `packages/types/src/ticket.ts` (`TicketDirectHandling`, `TicketSelfRepairSummary`) + `index.ts` re-export 확인
- Modify: `apps/web/src/lib/ticket-manager-api.ts` (직접 처리 mutation 3종, job 조회 partnership 반영)
- Modify: `apps/web/src/lib/manager-mapping.ts` / `apps/web/src/lib/defect-mapping.ts` (directHandling·selfRepair 매핑)
- Modify: `apps/web/src/app/manager/ticket/dash/01/actions.ts` (서버 액션 3종)
- Modify: `apps/web/src/app/manager/ticket/dash/01/page.tsx` + `apps/web/src/app/manager/ticket/_components/ticket-manager-ui.tsx` (다음 행동 카드: 직접 처리 시작/완료 폼(note 필수·선택 비용)/취소, 상태 배지)
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx` (자가수리 배지)
- Modify: 관리자 업체 잡 화면(대시 04 계열) — UNREGISTERED 읽기전용 안내, 관리자 액션 비노출
- Modify: `apps/web/src/app/tenant/defect/11/page.tsx` ("수리 진행" 섹션 직접 처리 상태 분기 — 155~172행 부근)
- Modify/Test: `apps/web/src/lib/ticket-manager-responsibility-card.spec.ts` 또는 신규 `apps/web/src/lib/ticket-manager-direct-handling.spec.ts`

- [ ] 웹 계약 테스트 먼저 RED → 구현 → GREEN: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/<spec>.ts`
- [ ] 세입자 문구: AI 값 아님 — "관리자가 직접 처리 중"처럼 주체 명시.

### Task 4: 통합 검증

- [ ] migration 적용(도커 postgres 5433, DB `roomlog_migrated`) 후 `prisma generate` 재확인.
- [ ] API/웹 대상 스펙 재실행(기존 실패 34+8건은 이 작업과 무관 — 새 실패만 0건 확인).
- [ ] `pnpm` 부재 환경 주의: 빌드는 `node_modules/.bin/*` 직접 실행 또는 npx.
- [ ] `bash scripts/verify.sh` 실행, 변경 파일 자체 검토.
