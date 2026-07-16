# Tenant Vendor Workflow M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세입자 책임 하자에서 협력업체 견적과 방문 일정을 세입자가 확인하고, 업체 완료 보고를 승인한 뒤 세입자 소유 수리비 지급 요청을 생성한다.

**Architecture:** 기존 `PrismaVendorWorkflowRepository`의 단일 수리 상태기계를 역할 인지형 명령으로 확장한다. 세입자 권한은 `Ticket.tenantId`, 현재 `TenantRoom`, 그리고 세입자가 생성한 `VENDOR_JOB_ASSIGNED` 이벤트를 모두 확인한다. AI 프롬프트나 음성 구현은 바꾸지 않고, 세입자 화면과 향후 AI 도구가 함께 호출할 REST 명령만 제공한다.

**Tech Stack:** TypeScript 5.9, NestJS 11, Prisma 7.8/PostgreSQL, Next.js 16/React 19, Node test, Docker Compose.

## Global Constraints

- 기존 협력업체 후보 → 미리보기 → 사용자 확인 → 요청 생성 흐름을 재사용한다.
- 세입자 책임 작업만 세입자 견적·완료 명령을 허용하고 관리자 책임 작업은 기존 관리자 명령을 유지한다.
- 세입자 견적 승인에서 비용 부담자는 서버가 `TENANT`로 고정한다.
- 완료 확인 전에는 세입자 지급 요청을 만들지 않는다.
- 완료 승인 transaction에서 `payerRole=TENANT`, `payerUserId=tenantId`, `status=PENDING_APPROVAL` 지급 요청을 정확히 한 번 생성한다.
- 완료 반려는 지급 요청을 만들지 않고 작업을 `IN_PROGRESS`로 되돌린다.
- 완료 사진은 해당 작업의 세입자만 조회한다.
- AI 에이전트 내부 프롬프트·모델·음성 코드는 수정하지 않는다.
- 새 UI 스타일은 CSS 토큰만 사용하며 raw 색상은 추가하지 않는다.
- 실제 Toss 결제 UI는 M4 범위다.

---

### Task 1: 세입자 검토자와 완료 확인 권한을 DB에 기록

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260716100000_tenant_vendor_workflow/migration.sql`
- Test: `apps/api/src/roomlog/tenant-vendor-workflow.schema.spec.ts`

**Interfaces:**
- Produces: `VendorEstimate.reviewedByTenantId`, `RepairCompletionDecision.tenantId`, `RepairCompletionDecisionSource.TENANT`.

- [ ] **Step 1: Write failing schema and migration contract tests**

```ts
assert.match(schema, /reviewedByTenantId\s+String\?/);
assert.match(schema, /enum RepairCompletionDecisionSource[\s\S]*TENANT/);
assert.match(migration, /RepairCompletionDecision_actor_shape/);
```

- [ ] **Step 2: Run the focused contract test and confirm RED**

Run: `pnpm --filter @roomlog/api exec tsx --test src/roomlog/tenant-vendor-workflow.schema.spec.ts`

- [ ] **Step 3: Add nullable tenant reviewer/decision relations and database actor-shape guards**

```prisma
reviewedByTenantId String?
tenantId String?
```

The migration must add `TENANT` to the enum, both foreign keys, prevent simultaneous manager/tenant reviewers, and require exactly the tenant actor for `source=TENANT`.

- [ ] **Step 4: Generate Prisma client and confirm GREEN**

Run: `pnpm db:generate && pnpm --filter @roomlog/api exec tsx --test src/roomlog/tenant-vendor-workflow.schema.spec.ts`

- [ ] **Step 5: Commit only Task 1 files**

### Task 2: 역할 인지형 견적·방문·완료 상태기계와 API

**Files:**
- Modify: `packages/types/src/tenant-vendor-connection.ts`
- Modify: `packages/types/src/vendor-workflow.ts`
- Modify: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Test: `apps/api/src/roomlog/prisma-tenant-vendor-workflow.spec.ts`
- Test: `apps/api/src/roomlog/tenant-vendor-workflow.controller.spec.ts`

**Interfaces:**
- Produces: `GET /tenant/complaints/:complaintId/vendor-workflow`.
- Produces: `POST /tenant/repairs/:repairId/estimates/:estimateId/review` with `APPROVE | REQUEST_REVISION`.
- Produces: `POST /tenant/repairs/:repairId/estimates/:estimateId/confirm-visit`.
- Produces: `POST /tenant/repairs/:repairId/completion-decisions`.

- [ ] **Step 1: Write failing repository tests for tenant authority and manager/tenant isolation**

```ts
await repository.reviewTenantEstimate(tenantId, repairId, estimateId, { action: "APPROVE" });
await assert.rejects(
  repository.reviewTenantEstimate(otherTenantId, repairId, estimateId, { action: "APPROVE" }),
  /권한/
);
```

Cover submitted fixed estimate approval, revision request, visit confirmation, duplicate replay, cross-tenant access, and manager-assigned repair rejection.

- [ ] **Step 2: Run focused repository tests and confirm RED**

Run: `pnpm --filter @roomlog/api exec tsx --test src/roomlog/prisma-tenant-vendor-workflow.spec.ts`

- [ ] **Step 3: Implement tenant-safe workflow projection and role-aware commands**

```ts
type TenantVendorEstimateReviewInput =
  | { action: "APPROVE" }
  | { action: "REQUEST_REVISION"; note: string };
```

Use one transaction per command. Approval fixes `costBearer=TENANT`; completion approval creates the tenant `VendorPaymentRequest` and audit/event rows atomically. Vendor estimate/completion notifications target the tenant for tenant-origin work.

- [ ] **Step 4: Write and run controller/domain tests**

Verify auth-derived tenant identity, caller identity rejection, public response redaction, and stable conflict messages.

- [ ] **Step 5: Run focused repository + controller tests and confirm GREEN**

- [ ] **Step 6: Commit only Task 2 files**

### Task 3: 세입자 완료 사진 접근

**Files:**
- Modify: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/vendor-completion-attachment.service.ts`
- Test: `apps/api/src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`
- Test: `apps/api/src/roomlog/prisma-vendor-workflow.completion.spec.ts`

**Interfaces:**
- Consumes: tenant-origin repair authority from Task 2.
- Produces: tenant-scoped reads through existing `/vendor-completion-files/:fileKey` route.

- [ ] **Step 1: Add failing own-tenant/cross-tenant attachment tests**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Add `TENANT` access scope and enforce ticket tenant + current room link**
- [ ] **Step 4: Confirm focused completion tests GREEN**
- [ ] **Step 5: Commit only Task 3 files**

### Task 4: 세입자 견적·완료 확인 UI

**Files:**
- Create: `apps/web/src/lib/tenant-vendor-workflow-api.ts`
- Create: `apps/web/src/lib/tenant-vendor-workflow-api.spec.ts`
- Create: `apps/web/src/app/my/flows/TenantVendorWorkflowPanel.tsx`
- Create: `apps/web/src/app/my/flows/tenant-vendor-workflow.ts`
- Create: `apps/web/src/app/my/flows/tenant-vendor-workflow.spec.ts`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 2 REST APIs.
- Produces: complaint detail sheet inside `PhoneFrame` with estimate, visit, completion, and payment-ready states.

- [ ] **Step 1: Write failing API route and UI state tests**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Implement no-fallback mutation client and deterministic reducer/view model**
- [ ] **Step 4: Render vendor summary, itemized estimate, visit confirmation, completion evidence, approve/rework actions, and `결제 준비 완료` state**
- [ ] **Step 5: Confirm focused web tests GREEN**
- [ ] **Step 6: Commit only Task 4 files**

### Task 5: 통합 검증과 Docker 확인

**Files:**
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Build shared types**

Run: `pnpm --filter @roomlog/types build`

- [ ] **Step 2: Run all API and web tests once**

Run: `pnpm test:api && pnpm test:web`

- [ ] **Step 3: Run repository verification**

Run: `bash scripts/verify.sh`

- [ ] **Step 4: Rebuild Docker and inspect health**

Run: `docker compose up -d --build api web`

- [ ] **Step 5: Verify tenant screen without executing an actual payment**

Confirm candidate request, estimate approval, completion confirmation, and tenant-owned `PENDING_APPROVAL` request. Do not open or complete Toss payment in M3.

- [ ] **Step 6: Review only M3 diff and commit verification record**
