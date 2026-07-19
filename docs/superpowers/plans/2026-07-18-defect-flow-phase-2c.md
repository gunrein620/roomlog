# 하자 흐름 2차분C Implementation Plan

> **For agentic workers:** 테스트 우선. git 조작 금지. 설계: `docs/superpowers/specs/2026-07-18-defect-flow-phase-2c-design.md`.
> **파일 소유권**: `apps/web/src/app/my/flows/**`와 `apps/web/src/lib/tenant-vendor-workflow-api.ts`는 다른 작업자가 동시 작업 중 — 절대 수정하지 말 것. 세입자 계약은 `packages/types`까지만.

**Goal:** 세입자 방문 가능 시간의 업체 노출 + 방문 시간 재협의 왕복(기존 견적 버전 체계 재사용)을 api↔vendor/manager 화면에 연결한다.

## Global Constraints

- 새 테이블·새 상태·새 협의 엔티티 금지 — REQUEST_REVISION/REVISION_REQUESTED/SUPERSEDED 재사용.
- 검증은 서버에서. 업체 표면에 세입자 개인정보 추가 노출 금지(availableTimes만).
- confirm-visit 이후 일정 변경은 범위 밖(채팅 담당).

---

### Task 1: API 회귀 계약 (RED)

**Files:**
- Modify/Test: `apps/api/src/roomlog/roomlog.service.spec.ts` 또는 도메인 스펙(기존 vendor-workflow 테스트 위치를 따름)

- [ ] 업체 잡 상세 `tenantAvailableTimes` 노출(있음/없음) 실패 테스트.
- [ ] 세입자 REQUEST_REVISION + `tenantAvailableTimes` → Complaint.availableTimes 갱신 + REVISION_REQUESTED 실패 테스트. 관리자 경로는 미갱신 검증.
- [ ] confirm-visit(세입자·관리자 양 경로) 세입자 노출 메시지 생성 실패 테스트.
- [ ] transpile-only 단일 실행으로 RED 확인.

### Task 2: API 구현 (GREEN)

**Files:**
- Modify: `packages/types/src/vendor-workflow.ts` (`VendorJobDetail.tenantAvailableTimes`, `VendorEstimateReviewInput` 확장)
- Modify: `packages/types/src/tenant-vendor-connection.ts` (`TenantVendorEstimateReviewInput` 확장 — 실제 정의 위치 확인)
- Confirm: `packages/types/src/index.ts` re-export
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts` (잡 상세 join 노출 — 758행 부근 review 입력 처리, 검증 포함)
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts` · 관련 tenant-vendor-connection 경로 (availableTimes 갱신)
- Modify: `apps/api/src/roomlog/roomlog.service.ts` (confirm-visit 메시지 — 기존 메시지 생성 헬퍼 재사용)
- Modify/Test: 해당 스펙 파일들

- [ ] Task 1 GREEN. DB 스펙은 `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test`.

### Task 3: 업체·관리자 화면

**Files:**
- Modify: `apps/web/src/app/vendor/job/01/page.tsx` · `apps/web/src/app/vendor/job/02/**` (세입자 방문 가능 시간 표시, 재협의 사유(reviewNote) 표시)
- Modify: 관리자 견적 검토 화면(`apps/web/src/app/manager/ticket/dash/04|05/**` — 실제 방문 확정 UI 위치 확인) — "이 일정으로 확정" / "다른 시간 요청"(note 필수, REQUEST_REVISION 호출)
- Modify: `apps/web/src/lib/vendor-mgmt-api.ts` 등 관리자 API 클라이언트(필요시)
- Modify/Test: `apps/web/src/lib/ticket-manager-direct-handling.spec.ts` 스타일의 소스 계약 스펙(신규 `apps/web/src/lib/visit-negotiation.spec.ts` 권장)

- [ ] 웹 계약 스펙 RED → 구현 → GREEN: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/<spec>.ts`
- [ ] `my/flows`·`tenant-vendor-workflow-api.ts`는 건드리지 않았는지 diff 자체 검토.

### Task 4: 통합 검증

- [ ] 대상 스펙 재실행(기존 실패 집합 외 신규 실패 0건 확인).
- [ ] `pnpm` 부재 — `node_modules/.bin/*` 직접 실행.
- [ ] `bash scripts/verify.sh`.
