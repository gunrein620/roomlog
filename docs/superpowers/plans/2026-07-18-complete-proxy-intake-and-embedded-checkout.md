# 대리접수 및 세입자탭 결제 체크아웃 완성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute the tasks inline. Preserve all existing uncommitted work.

**Goal:** 관리자 대리접수의 남은 웹 표면과 세입자 투명성 표시를 완성하고, 수리비 체크아웃을 세입자 하자 상세 시트 안으로 이관한다.

**Architecture:** 대리접수는 기존 `createComplaintRecord`와 티켓 처리 파이프라인을 그대로 사용한다. 결제는 기존 `TenantRepairPaymentCheckout`과 Toss 콜백 라우트를 재사용하되 임베드 모드와 `/living?complaintId=...` 복귀만 추가한다.

**Tech Stack:** Next.js App Router, React server actions, NestJS, Prisma/PostgreSQL, Node test runner, Docker Compose.

## Global Constraints

- 새 TicketStatus 또는 별도 하자 처리 흐름을 만들지 않는다.
- 대리접수는 실제 연결 세입자에게 귀속하고 `MANAGER_PROXY` 출처를 보존한다.
- 세입자 개인정보는 이름과 호실만 관리자 폼에 노출한다.
- 기존 독립 결제 라우트와 Toss 콜백 호환성을 유지한다.
- 신규 스타일은 `var(--...)` 토큰만 사용한다.

---

### Task 1: 임베드 체크아웃 계약과 구현

**Files:**
- Create: `apps/web/src/lib/tenant-repair-payment-return-path.spec.ts`
- Create: `apps/web/src/app/my/flows/tenant-vendor-workflow-payment.spec.ts`
- Modify: `apps/web/src/lib/tenant-repair-payment-return-path.ts`
- Modify: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.tsx`
- Modify: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.module.css`
- Modify: `apps/web/src/app/my/flows/TenantVendorWorkflowPanel.tsx`

- [ ] `/living?complaintId=...` 보존과 외부·유사 경로 거부 테스트를 먼저 작성하고 RED를 확인한다.
- [ ] 패널의 임베드 열기·닫기·재조회와 체크아웃의 임베드 닫기 버튼 계약 테스트를 작성하고 RED를 확인한다.
- [ ] `embedded`, `onClose` 인터페이스와 패널 상태 전환을 최소 구현한다.
- [ ] 집중 테스트를 GREEN으로 만들고 독립 결제 라우트 호환성을 확인한다.

### Task 2: 관리자 대리접수 웹 표면

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/proxy-intake.spec.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/actions.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ManagerProxyIntakeDialog.tsx`
- Modify: `apps/web/src/lib/ticket-manager-api.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] API 경로, 서버 액션, 폼 필드, 단일·복수 세입자 UI 계약 테스트를 작성하고 RED를 확인한다.
- [ ] 호실 목록과 접수 mutation 타입·클라이언트를 구현한다.
- [ ] 서버 액션에서 사진을 업로드한 뒤 attachment URL과 입력을 접수 API로 보낸다.
- [ ] 대시보드 헤더 버튼과 접근 가능한 모달 폼을 구현한다.
- [ ] 집중 웹 계약 테스트를 GREEN으로 만든다.

### Task 3: 세입자 대리접수 투명성

**Files:**
- Create: `apps/web/src/app/my/flows/tenant-manager-proxy-badge.spec.ts`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] `sourceChannel === "MANAGER_PROXY"`일 때 배지를 요구하는 RED 계약 테스트를 작성한다.
- [ ] 목록/상세 데이터 정규화에 sourceChannel을 보존하고 상세 헤더에 `관리자 대리 접수` 배지를 표시한다.
- [ ] 집중 테스트를 GREEN으로 만든다.

### Task 4: 하자 처리 플로우 통합 검증 및 PR

- [ ] Prisma enum과 양쪽 로컬 DB migration 상태를 확인한다.
- [ ] API 대리접수·projector·realtime 집중 테스트와 web 집중 테스트를 실행한다.
- [ ] `bash scripts/verify.sh`와 Docker 스택 E2E를 실행한다.
- [ ] 대리접수 → 관리자 목록 → 세입자 상세 → 책임확정/업체배정 경로와 세입자 수리비 결제 진입·복귀를 재검토한다.
- [ ] 전체 diff를 재검토하고 `dev` 대상 PR 제목에 `[김용]`을 넣으며 하자 처리 플로우 영향을 본문에 정리한다.
