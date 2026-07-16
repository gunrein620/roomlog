# Vendor Management Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 전역 업체를 자기 업체로 등록하고 안전하게 수리 건에 배정하며, 업체가 실제 작업함에서 버전형 견적·일정·완료보고를 처리하고 관리자가 개별 완료를 결정해 결제 평가 경계까지 넘기는 영속 워크플로를 구축한다.

**Architecture:** foundation이 제공하는 업체 원장·활성 계정 링크를 읽고, workflow의 모든 명령과 판정은 awaited Prisma repository와 직접 DB transaction을 진실의 출처로 사용한다. `ManagerVendor`, 견적 버전, 완료보고, 완료결정, 결제요청과 immutable outbox event/per-consumer delivery를 workflow가 소유한다. 완료 승인 transaction은 알림용 `NOTIFICATION` delivery와 결제 평가용 `CREDIT_EVALUATION` delivery를 함께 commit하고, 별도 worker가 workflow-owned credit port를 호출한다. 이 슬라이스의 기본 adapter는 `DEFERRED`를 반환해 delivery를 durable pending 상태로 유지하며, 실제 `CreditService.evaluateAfterCompletion(...)` adapter/provider 교체와 backlog drain은 credit 계획이 소유한다. Next.js 표면은 읽기 전용 데모 fallback만 허용하고 실제 mutation은 반드시 Nest API 성공을 확인한다.

**Tech Stack:** TypeScript, pnpm workspace, NestJS, Prisma 7/PostgreSQL, Next.js 16 App Router, React server actions, Node test runner, `@roomlog/types`, `@roomlog/ui`

## Global Constraints

- 이 계획은 승인 설계의 슬라이스 2인 관리자 업체관리·배정·업체 작업·견적·완료·정산·알림만 구현한다. 업체 원장/활성화는 foundation 계획, 크레딧 계정·Toss·원장·차감·취소는 credit 계획이 소유한다.
- foundation migrations `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`과 `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`이 이 계획보다 먼저 적용되어야 한다. 두 번째 migration 이후 업체 로그인 연결의 유일한 진실은 `VendorAccountLink`이며 `VendorProfile.userId`는 존재하지 않는다.
- workflow migration 경로와 순서는 `prisma/migrations/20260714110000_vendor_workflow/migration.sql`로 고정한다. 과거 migration은 수정하지 않는다.
- foundation 공유 계약은 `packages/types/src/vendor.ts`, workflow 공유 계약은 반드시 별도 파일 `packages/types/src/vendor-workflow.ts`에 둔다. 공유 API 타입 이름으로 `VendorProfile`을 새로 만들지 않는다.
- 기존 `VendorProfile.id`, `Ticket.assignedVendorId`, `RepairRequest.vendorId`를 안정적인 `vendorId`/관계로 보존한다.
- 관리자는 전역 업체 원장을 생성·수정하지 않는다. `manual:<vendorId>` 가짜 계정, 관리자 직접 업체 생성/편집 API와 UI를 제거한다.
- 관리자 식별자는 인증 세션/workspace에서, 로그인 업체 식별자는 foundation의 `VendorAccountResolver.resolveActiveVendorId(userId): Promise<string | undefined>`에서 결정한다. workflow domain은 `undefined`를 `403 Forbidden`으로 변환하며 vendor-facing request body의 `managerId`/`vendorId`는 신뢰하지 않는다. 관리자가 등록·배정 대상으로 선택한 catalog `vendorId`는 명령 데이터로 받을 수 있지만 서버가 catalog/account/ManagerVendor 소속 조건을 모두 다시 검증한다. 기존 중앙 facade를 거치는 호환 호출은 같은 계약의 `RoomlogService.resolveActiveVendorId(userId)`만 사용한다.
- 미인증, 비활성, 활성 계정 미연결, 해당 관리자의 `ManagerVendor ACTIVE`가 아닌 업체, 작업 업종과 호환되지 않는 업체는 신규 배정을 거부한다.
- 견적 line item과 총액은 원 단위 양의 정수로 서버가 다시 계산한다. 승인 견적은 수정하지 않고 수정 요청/추가비용은 새 version으로 보존하며 부분 승인은 제공하지 않는다.
- 완료보고는 불변 version이다. 같은 `submissionKey`와 같은 payload는 기존 결과를 반환하고, 같은 key와 다른 payload는 `409 Conflict`로 거부한다.
- 비용 부담자가 `LANDLORD`일 때만 완료보고와 단일 `VendorPaymentRequest(WAITING_COMPLETION)`을 같은 transaction에서 생성/갱신한다. `TENANT`와 `PENDING`은 완료보고만 저장하고 관리자 결제요청을 만들지 않는다.
- 결제요청 금액과 `approvedEstimateId`는 서버가 승인 견적에서 복사한다. 업체 입력에 최종 금액 필드를 노출하지 않는다.
- 개별 `repairId`의 최신 완료보고에 대한 `source=MANAGER`, `decision=APPROVED`만 결제 평가 증거다. 티켓 전체 완료, 세입자 확인, legacy migration 결정은 결제 트리거가 아니다.
- workflow는 credit 구현을 복제하거나 credit 테이블을 직접 갱신하지 않고 `CreditModule`/`CreditService`를 import하지 않는다. workflow-owned `VendorCompletionCreditBoundary.evaluateAfterCompletion({ managerId, paymentRequestId, completionDecisionId, actorUserId })` port는 `CompletionCreditDeliveryWorker`만 호출한다. 기본 deferred adapter는 요청을 `WAITING_COMPLETION`으로 유지하고 delivery를 재예약하며, 실제 `CreditService` adapter/provider 교체와 같은 `completionDecisionId` 재시도는 credit 계획이 소유한다.
- `RoomlogStore` 선변경, `persistStore()`, 비동기 `PrismaStoreProjector`를 업체 등록·배정·견적·완료·결제요청 명령이나 판정에 사용하지 않는다. 해당 명령은 awaited direct Prisma transaction이 commit되어야 성공이다.
- 상태 transaction 안에서 unique `eventKey`의 immutable outbox row와 consumer별 delivery row를 기록하고 commit 뒤에만 처리한다. 일반 이벤트는 `NOTIFICATION`, 완료 승인 이벤트는 `NOTIFICATION`과 `CREDIT_EVALUATION` delivery를 만든다. 한 consumer의 성공이 다른 consumer를 완료 처리하지 않으며, 알림/credit 호출 실패·프로세스 crash·lease 만료는 commit된 상태를 되돌리지 않고 같은 event/decision ID로 재처리한다.
- `RoomlogDomainEvent`에는 안정적인 `eventKey`, 대상 사용자 ID, 선택적 `vendorId`/`repairId`/`paymentRequestId`, 상태 코드만 담는다. 업체 없는 credit top-up 이벤트에 가짜 vendor ID를 넣지 않으며 AI 문구를 생성하거나 저장하지 않는다.
- AI 모델, 프롬프트, 음성, 책임 판단, 자연어 요약 생성과 책임 경로 UI는 비목표다. workflow는 이미 확정되어 전달된 `repairId`, 수리 분야, 비용 부담 주체만 소비하고 이를 재판정하지 않는다.
- 세입자 공개 업체 검색과 외부 지역 업체/전화 시도(설계 슬라이스 4)는 이 계획에서 구현하지 않는다. 내부 연락처·관리자 메모·계정 링크·결제 정책을 세입자 projection에 추가하지 않는다.
- 업체/임차인 화면은 `PhoneFrame`, 관리자 화면은 기존 `ManagerShell`/`ManagerAppShell`을 유지한다. 새 스타일은 `packages/ui/src/tokens.css`의 `var(--...)`만 사용하며 raw hex를 추가하지 않는다.
- API가 미기동이면 읽기 화면은 명시적인 `DEMO` 표식과 함께 fallback할 수 있다. API의 정상 빈 응답·404·401/403을 데모 작업으로 바꾸지 않고, mutation 실패를 성공처럼 렌더하지 않는다.
- 개발·DB 통합 검증은 local docker-compose를 기준으로 하며 병합 전 `pnpm test:api`, `pnpm test:web`, `bash scripts/verify.sh`를 실행한다.

---

## File and Boundary Map

| 책임 | 파일 | 소유 경계 |
| --- | --- | --- |
| workflow 공유 타입 | `packages/types/src/vendor-workflow.ts` | `ManagerVendorView`, 작업/견적/완료/정산 DTO, domain event 계약만 소유 |
| workflow schema/backfill | `prisma/schema.prisma`, `prisma/migrations/20260714110000_vendor_workflow/migration.sql` | workflow 테이블·인덱스·legacy backfill; credit ledger/attempt/top-up은 생성하지 않음 |
| 내 업체 관계 | `apps/api/src/roomlog/manager-vendor.repository.ts`, `apps/api/src/roomlog/prisma-manager-vendor.repository.ts` | catalog를 변경하지 않는 등록·메모·archive 및 관리자 projection |
| 작업 명령 | `apps/api/src/roomlog/vendor-workflow.repository.ts`, `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts` | 배정·견적·일정·완료보고·결정·정산 query의 직접 Prisma transaction |
| 도메인 정책 | `apps/api/src/roomlog/services/roomlog-manager-vendor.domain.ts`, `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts` | 인증 identity를 repository command로 연결하고 상태 오류를 HTTP 오류로 변환 |
| durable event | `apps/api/src/domain-events/domain-event.repository.ts`, `apps/api/src/domain-events/prisma-domain-event.repository.ts`, `apps/api/src/domain-events/domain-event.dispatcher.ts`, `apps/api/src/domain-events/domain-events.module.ts` | immutable event + consumer별 lease/retry; `DomainEventsModule`은 `RealtimeModule`만 import하고 repository/dispatcher를 export |
| completion-credit delivery | `apps/api/src/roomlog/vendor-completion-credit.boundary.ts`, `apps/api/src/roomlog/completion-credit-delivery.worker.ts` | `CREDIT_EVALUATION` delivery claim, deferred/retry/delivered 처리; 실제 adapter는 credit 계획 소유 |
| HTTP wiring | `apps/api/src/roomlog/roomlog.controller.ts`, `apps/api/src/roomlog/roomlog.module.ts` | 세션 ID를 전달하고 body scope ID를 무시/거부; legacy mutation 은퇴 |
| 관리자 표면 | `apps/web/src/app/manager/vendor-mgmt/**`, `apps/web/src/app/manager/ticket/dash/04/**`, `apps/web/src/lib/vendor-mgmt-{api,nav}.ts` | 정식 의미 라우트, catalog 등록/archive, 실제 배정/견적 검토 |
| 업체 표면 | `apps/web/src/app/vendor/job/**`, `apps/web/src/app/vendor/settlements/**`, `apps/web/src/lib/vendor-{api,nav}.ts` | 실제 작업 상태, 구조화 견적, 일정/진행, 완료보고, 정산 목록 |

Dependency order is strict: foundation migrations/types/resolver → Tasks 1–10. The credit plan runs after Task 6's schema/port/worker exists and owns the real `CreditService` adapter/provider replacement plus deferred backlog drain; this workflow plan remains independently GREEN because `DEFERRED` delivery is observable and retryable rather than lost.

### Task 1: Define the Workflow Contract in `@roomlog/types`

**Files:**
- Create: `packages/types/src/vendor-workflow.ts`
- Create: `packages/types/src/domain-event.ts`
- Modify: `packages/types/src/index.ts:3-11`
- Test: `apps/api/src/roomlog/vendor-workflow.contract.spec.ts`

**Interfaces:**
- Consumes: `VendorCatalogRecord`, `VendorAccountView` from `packages/types/src/vendor.ts`
- Produces: `ManagerVendorView`, `ManagerVendorDetail`, `VendorCatalogSearchFilters`, `VendorCatalogSearchResult`, `VendorJobSummary`, `VendorJobDetail`, `VendorEstimate`, `VendorEstimateDraftInput`, `VendorEstimateReviewInput`, `VendorCompletionReport`, `SubmitVendorCompletionInput`, `RepairCompletionDecision`, `DecideRepairCompletionInput`, `VendorPaymentRequest`, `VendorSettlementRow`, shared `RoomlogDomainEvent`

- [ ] **Step 1: Write the failing compile-time contract test**

```ts
// apps/api/src/roomlog/vendor-workflow.contract.spec.ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type {
  ManagerVendorView,
  SubmitVendorCompletionInput,
  RoomlogDomainEvent,
  VendorEstimateDraftInput,
  VendorPaymentRequest
} from "@roomlog/types";

describe("vendor workflow shared contract", () => {
  it("keeps estimate, completion, payment, and event shapes explicit", () => {
    const draft = {
      responseType: "FIXED_ESTIMATE",
      estimatedDurationMinutes: 90,
      workDescription: "배수관 연결부 교체",
      lineItems: [{ category: "LABOR", description: "교체 작업", quantity: 1, unitAmount: 120000 }]
    } satisfies VendorEstimateDraftInput;
    const completion = {
      workSummary: "교체와 누수 시험 완료",
      completedAt: "2026-07-14T10:00:00.000Z",
      attachmentIds: ["att_done_1"],
      submissionKey: "completion:repair-1:attempt-1"
    } satisfies SubmitVendorCompletionInput;
    const event = {
      eventKey: "vendor-estimate-submitted:estimate-1",
      type: "VENDOR_ESTIMATE_SUBMITTED",
      targetUserIds: ["manager-1"],
      vendorId: "vendor-1",
      repairId: "repair-1",
      statusCode: "SUBMITTED",
      occurredAt: "2026-07-14T10:00:00.000Z"
    } satisfies RoomlogDomainEvent;
    assert.equal(draft.lineItems[0].quantity * draft.lineItems[0].unitAmount, 120000);
    assert.equal(completion.submissionKey, "completion:repair-1:attempt-1");
    assert.equal(event.eventKey, "vendor-estimate-submitted:estimate-1");
    void ({} as ManagerVendorView);
    void ({} as VendorPaymentRequest);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.contract.spec.ts`

Expected: FAIL with `TS2305: Module '"@roomlog/types"' has no exported member 'ManagerVendorView'` (and the other missing workflow exports).

- [ ] **Step 3: Add the minimal discriminated contracts and re-export them**

```ts
// packages/types/src/vendor-workflow.ts
import type { VendorCatalogRecord } from "./vendor";

export type ManagerVendorStatus = "ACTIVE" | "ARCHIVED";
export type VendorAccountProjectionStatus = "ACTIVE" | "DISABLED" | "UNLINKED";

export interface VendorCatalogSearchFilters {
  query?: string;
  trade?: VendorCatalogRecord["trades"][number];
  serviceArea?: string;
  verificationStatus?: VendorCatalogRecord["verificationStatus"];
  isActive?: boolean;
}

export interface ManagerVendorView {
  id: string;
  managerId: string;
  vendorId: string;
  status: ManagerVendorStatus;
  managerNote?: string;
  registeredAt: string;
  catalog: VendorCatalogRecord;
  accountStatus: VendorAccountProjectionStatus;
  activeJobCount: number;
  waitingPaymentCount: number;
  completedJobCount: number;
}

export interface VendorCatalogSearchResult {
  catalog: VendorCatalogRecord;
  accountStatus: VendorAccountProjectionStatus;
  registrationStatus: ManagerVendorStatus | "UNREGISTERED";
  canAssign: boolean;
  assignmentBlockReasons: Array<"UNVERIFIED" | "INACTIVE" | "ACCOUNT_UNLINKED" | "NOT_REGISTERED">;
}

export interface ManagerVendorDetail {
  vendor: ManagerVendorView;
  jobs: VendorJobSummary[];
  performance: {
    completedCount: number;
    medianEstimateResponseHours?: number;
    averageApprovedAmount?: number;
    updatedAt: string;
  };
}

export type VendorEstimateResponseType = "FIXED_ESTIMATE" | "VISIT_REQUIRED" | "DECLINED";
export type VendorEstimateStatus =
  | "DRAFT" | "SUBMITTED" | "VISIT_SCHEDULED" | "DECLINED"
  | "REVISION_REQUESTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "SUPERSEDED";
export type VendorEstimateLineItemCategory = "VISIT" | "LABOR" | "MATERIAL";

export interface VendorEstimateLineItem {
  id: string;
  category: VendorEstimateLineItemCategory;
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  sortOrder: number;
}

export interface VendorEstimate {
  id: string;
  repairId: string;
  vendorId: string;
  version: number;
  responseType: VendorEstimateResponseType;
  status: VendorEstimateStatus;
  visitAvailableAt?: string;
  estimatedDurationMinutes?: number;
  workDescription?: string;
  declineReason?: string;
  totalAmount?: number;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByManagerId?: string;
  reviewNote?: string;
  lineItems: VendorEstimateLineItem[];
}

export type VendorEstimateDraftInput =
  | { responseType: "FIXED_ESTIMATE"; estimatedDurationMinutes?: number; workDescription: string; lineItems: Array<{ category: VendorEstimateLineItemCategory; description: string; quantity: number; unitAmount: number }> }
  | { responseType: "VISIT_REQUIRED"; visitAvailableAt: string; workDescription: string; lineItems?: never }
  | { responseType: "DECLINED"; declineReason: string; lineItems?: never };

export type VendorEstimateReviewInput =
  | { action: "APPROVE"; costBearer: "LANDLORD" | "TENANT" | "PENDING"; note?: string }
  | { action: "REQUEST_REVISION" | "REJECT"; note: string };

export type VendorPaymentRequestStatus =
  | "WAITING_COMPLETION" | "PENDING_APPROVAL" | "AUTO_PAID" | "MANUAL_CREDIT_PAID"
  | "DIRECT_PAID" | "INSUFFICIENT_CREDIT" | "CANCELLED" | "REVERSED" | "DIRECT_PAYMENT_VOIDED";

export interface VendorCompletionReport {
  id: string; repairId: string; vendorId: string; version: number;
  workSummary: string; completedAt: string; attachmentIds: string[];
  submissionKey: string; submittedAt: string;
}
export interface SubmitVendorCompletionInput {
  workSummary: string; completedAt: string; attachmentIds: string[]; submissionKey: string;
}
export interface RepairCompletionDecision {
  id: string; repairId: string; completionReportId: string; managerId?: string;
  source: "MANAGER" | "LEGACY_MIGRATION"; decision: "APPROVED" | "REJECTED";
  note?: string; decidedAt: string;
}
export type DecideRepairCompletionInput =
  | { decision: "APPROVED"; note?: string }
  | { decision: "REJECTED"; note: string };

export interface VendorPaymentRequest {
  id: string; repairId: string; vendorId: string; managerId: string;
  approvedEstimateId: string; completionReportId: string; completionDecisionId?: string;
  costId?: string; amount: number; status: VendorPaymentRequestStatus;
  failureReason?: string; lastAttemptMode?: "AUTO_CREDIT" | "MANUAL_CREDIT" | "DIRECT";
  ledgerEntryId?: string; createdAt: string; processedAt?: string;
}

export interface VendorJobSummary {
  repairId: string; ticketId: string; title: string; trade: string; status: string;
  publicLocation: string; latestEstimate?: VendorEstimate; latestCompletion?: VendorCompletionReport;
  paymentRequest?: VendorPaymentRequest; updatedAt: string;
}
export interface VendorJobDetail extends VendorJobSummary {
  description: string; attachmentIds: string[]; scheduledAt?: string;
  estimates: VendorEstimate[]; completionReports: VendorCompletionReport[];
}
export interface VendorSettlementRow {
  paymentRequest: VendorPaymentRequest; jobTitle: string; approvedAmount: number;
  requestedAt: string; statusLabel: string;
}

// packages/types/src/domain-event.ts — workflow/credit 공용, vendor workflow DTO와 분리
export type RoomlogDomainEventType =
  | "VENDOR_JOB_ASSIGNED" | "VENDOR_ESTIMATE_SUBMITTED" | "VENDOR_ESTIMATE_REVISED"
  | "VENDOR_ESTIMATE_APPROVED" | "VENDOR_ESTIMATE_REVISION_REQUESTED" | "VENDOR_ESTIMATE_REJECTED"
  | "VENDOR_COMPLETION_SUBMITTED" | "VENDOR_PAYMENT_REQUEST_CREATED" | "VENDOR_COMPLETION_APPROVED"
  | "VENDOR_COMPLETION_REJECTED" | "VENDOR_PAYMENT_PENDING_APPROVAL" | "VENDOR_PAYMENT_PAID" | "VENDOR_PAYMENT_REVERSED"
  | "VENDOR_PAYMENT_CANCELLED" | "VENDOR_DIRECT_PAYMENT_VOIDED"
  | "VENDOR_PAYMENT_INSUFFICIENT_CREDIT" | "MANAGER_CREDIT_TOPUP_SUCCEEDED" | "MANAGER_CREDIT_TOPUP_FAILED";
export interface RoomlogDomainEvent {
  eventKey: string; type: RoomlogDomainEventType; targetUserIds: string[];
  vendorId?: string; managerId?: string; repairId?: string; paymentRequestId?: string;
  completionDecisionId?: string; actorUserId?: string;
  statusCode: string; occurredAt: string;
}
```

Add `export * from "./vendor-workflow";` and `export * from "./domain-event";` to `packages/types/src/index.ts`. Do not move vendor workflow names back into legacy `vendor-mgmt.ts` or make credit import a vendor-specific event module.

- [ ] **Step 4: Run type and contract tests to verify GREEN**

Run: `pnpm --filter @roomlog/types typecheck && pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.contract.spec.ts`

Expected: both commands exit `0`; the Node test reports `1 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/vendor-workflow.ts packages/types/src/domain-event.ts packages/types/src/index.ts apps/api/src/roomlog/vendor-workflow.contract.spec.ts
git commit -m "feat: define vendor workflow contracts"
```

### Task 2: Add Workflow Schema, Constraints, and Deterministic Backfill

**Files:**
- Modify: `prisma/schema.prisma:202-209,626-641,928-956,999-1024,1045-1075`
- Create: `prisma/migrations/20260714110000_vendor_workflow/migration.sql`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts:274-283,599-617,1831-1869`
- Test: `apps/api/src/roomlog/vendor-workflow.schema.spec.ts`

**Interfaces:**
- Consumes: foundation tables `VendorProfile`, `VendorAccountLink`, canonical catalog fields, existing `Ticket`, `RepairRequest`, `Attachment`, `Cost`
- Produces: Prisma models/enums for `ManagerVendor`, `VendorEstimate`, `VendorEstimateLineItem`, `VendorCompletionReport`, `VendorCompletionReportAttachment`, `RepairCompletionDecision`, `VendorPaymentRequest`, `VendorPaymentAuditEvent`, immutable `DomainEventOutbox`, per-consumer `DomainEventDelivery`; authoritative nullable unique `VendorPaymentRequest.costId`

- [ ] **Step 1: Write a failing DB/schema test for required uniqueness and backfill surfaces**

```ts
// apps/api/src/roomlog/vendor-workflow.schema.spec.ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

describe("vendor workflow schema", () => {
  it("has durable workflow tables and partial uniqueness guards", { skip: !databaseUrl }, async () => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN
        ('ManagerVendor','VendorEstimate','VendorCompletionReport','VendorCompletionReportAttachment','RepairCompletionDecision','VendorPaymentRequest','DomainEventOutbox','DomainEventDelivery')`;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('one_active_repair_per_ticket','one_submitted_estimate_per_repair','one_approved_estimate_per_repair')`;
    assert.equal(tables.length, 8);
    assert.equal(indexes.length, 3);
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run the schema test to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.schema.spec.ts`

Expected: FAIL because the workflow tables/indexes do not exist (or TypeScript reports missing generated Prisma members before `prisma generate`).

- [ ] **Step 3: Add Prisma models and the single forward-only migration**

Use explicit enums matching Task 1 and these constraints in `schema.prisma`:

```prisma
enum ManagerVendorStatus { ACTIVE ARCHIVED }
enum VendorEstimateResponseType { FIXED_ESTIMATE VISIT_REQUIRED DECLINED }
enum VendorEstimateStatus { DRAFT SUBMITTED VISIT_SCHEDULED DECLINED REVISION_REQUESTED APPROVED REJECTED WITHDRAWN SUPERSEDED }
enum VendorEstimateLineItemCategory { VISIT LABOR MATERIAL }
enum RepairCompletionDecisionSource { MANAGER LEGACY_MIGRATION }
enum RepairCompletionDecisionValue { APPROVED REJECTED }
enum VendorPaymentRequestStatus { WAITING_COMPLETION PENDING_APPROVAL AUTO_PAID MANUAL_CREDIT_PAID DIRECT_PAID INSUFFICIENT_CREDIT CANCELLED REVERSED DIRECT_PAYMENT_VOIDED }
enum VendorPaymentAttemptMode { AUTO_CREDIT MANUAL_CREDIT DIRECT }
enum VendorPaymentAuditEventType { REQUESTED COMPLETION_APPROVED COMPLETION_REJECTED PENDING_APPROVAL INSUFFICIENT_CREDIT AUTO_PAID MANUAL_CREDIT_PAID DIRECT_PAID CREDIT_REVERSED DIRECT_PAYMENT_VOIDED CANCELLED }
enum DomainEventDeliveryConsumer { NOTIFICATION CREDIT_EVALUATION }
enum DomainEventDeliveryState { PENDING PROCESSING DELIVERED }
enum RoomlogDomainEventType {
  VENDOR_JOB_ASSIGNED VENDOR_ESTIMATE_SUBMITTED VENDOR_ESTIMATE_REVISED
  VENDOR_ESTIMATE_APPROVED VENDOR_ESTIMATE_REVISION_REQUESTED VENDOR_ESTIMATE_REJECTED
  VENDOR_COMPLETION_SUBMITTED VENDOR_PAYMENT_REQUEST_CREATED VENDOR_COMPLETION_APPROVED
  VENDOR_COMPLETION_REJECTED VENDOR_PAYMENT_PENDING_APPROVAL VENDOR_PAYMENT_PAID VENDOR_PAYMENT_REVERSED
  VENDOR_PAYMENT_CANCELLED VENDOR_DIRECT_PAYMENT_VOIDED
  VENDOR_PAYMENT_INSUFFICIENT_CREDIT MANAGER_CREDIT_TOPUP_SUCCEEDED MANAGER_CREDIT_TOPUP_FAILED
}

model ManagerVendor {
  id           String              @id
  managerId    String
  vendorId     String
  status       ManagerVendorStatus @default(ACTIVE)
  managerNote  String?
  registeredAt DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  manager      UserAccount         @relation(fields: [managerId], references: [id])
  vendor       VendorProfile       @relation(fields: [vendorId], references: [id])
  @@unique([managerId, vendorId])
  @@index([managerId, status])
}

model VendorEstimate {
  id                    String                     @id
  repairId              String
  vendorId              String
  version               Int
  responseType          VendorEstimateResponseType
  status                VendorEstimateStatus
  visitAvailableAt      DateTime?
  estimatedDurationMinutes Int?
  workDescription       String?
  declineReason         String?
  totalAmount           Int?
  submittedAt           DateTime?
  reviewedAt            DateTime?
  reviewedByManagerId   String?
  reviewNote            String?
  createdAt             DateTime                   @default(now())
  updatedAt             DateTime                   @updatedAt
  repair                RepairRequest              @relation(fields: [repairId], references: [id])
  vendor                VendorProfile              @relation(fields: [vendorId], references: [id])
  lineItems             VendorEstimateLineItem[]
  paymentRequests       VendorPaymentRequest[]
  @@unique([repairId, version])
  @@index([vendorId, status])
}

model VendorEstimateLineItem {
  id          String @id
  estimateId  String
  category    VendorEstimateLineItemCategory
  description String
  quantity    Int
  unitAmount  Int
  lineAmount  Int
  sortOrder   Int
  estimate    VendorEstimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  @@unique([estimateId, sortOrder])
}

model VendorCompletionReport {
  id             String   @id
  repairId       String
  vendorId       String
  version        Int
  workSummary    String
  completedAt    DateTime
  submissionKey  String   @unique
  payloadHash    String
  submittedAt    DateTime @default(now())
  repair         RepairRequest @relation(fields: [repairId], references: [id])
  vendor         VendorProfile @relation(fields: [vendorId], references: [id])
  attachments    VendorCompletionReportAttachment[]
  decision       RepairCompletionDecision?
  paymentRequests VendorPaymentRequest[]
  @@unique([repairId, version])
}

model VendorCompletionReportAttachment {
  completionReportId String
  attachmentId       String @unique
  sortOrder          Int
  completionReport   VendorCompletionReport @relation(fields: [completionReportId], references: [id], onDelete: Cascade)
  attachment         Attachment @relation(fields: [attachmentId], references: [id])
  @@id([completionReportId, attachmentId])
  @@unique([completionReportId, sortOrder])
}

model RepairCompletionDecision {
  id                 String @id
  repairId           String
  completionReportId String @unique
  managerId          String?
  source             RepairCompletionDecisionSource
  decision           RepairCompletionDecisionValue
  note               String?
  decidedAt          DateTime @default(now())
  repair             RepairRequest @relation(fields: [repairId], references: [id])
  completionReport   VendorCompletionReport @relation(fields: [completionReportId], references: [id])
  paymentRequest     VendorPaymentRequest?
  paymentAuditEvent  VendorPaymentAuditEvent?
}

model VendorPaymentRequest {
  id                   String @id
  repairId             String @unique
  vendorId             String
  managerId            String
  approvedEstimateId   String
  completionReportId   String
  completionDecisionId String? @unique
  costId               String? @unique
  amount               Int
  status               VendorPaymentRequestStatus @default(WAITING_COMPLETION)
  failureReason        String?
  lastAttemptMode      VendorPaymentAttemptMode?
  ledgerEntryId        String?
  createdAt            DateTime @default(now())
  processedAt          DateTime?
  repair               RepairRequest @relation(fields: [repairId], references: [id])
  vendor               VendorProfile @relation(fields: [vendorId], references: [id])
  approvedEstimate     VendorEstimate @relation(fields: [approvedEstimateId], references: [id])
  completionReport     VendorCompletionReport @relation(fields: [completionReportId], references: [id])
  completionDecision   RepairCompletionDecision? @relation(fields: [completionDecisionId], references: [id])
  cost                 Cost? @relation(fields: [costId], references: [id])
  auditEvents          VendorPaymentAuditEvent[]
  @@index([managerId, status, createdAt])
  @@index([vendorId, status, createdAt])
}

model VendorPaymentAuditEvent {
  id               String @id
  paymentRequestId String
  type             VendorPaymentAuditEventType
  dedupeKey        String @unique
  decisionId       String? @unique
  actorUserId      String?
  note             String?
  createdAt        DateTime @default(now())
  paymentRequest   VendorPaymentRequest @relation(fields: [paymentRequestId], references: [id])
  decision         RepairCompletionDecision? @relation(fields: [decisionId], references: [id])
  @@index([paymentRequestId, createdAt])
}

model DomainEventOutbox {
  id             String @id
  eventKey       String @unique
  payloadHash    String
  type           RoomlogDomainEventType
  targetUserIds  String[]
  vendorId       String?
  managerId      String?
  repairId       String?
  paymentRequestId String?
  completionDecisionId String?
  actorUserId    String?
  statusCode     String
  occurredAt     DateTime @default(now())
  deliveries     DomainEventDelivery[]
}

model DomainEventDelivery {
  id           String @id
  eventId      String
  consumer     DomainEventDeliveryConsumer
  state        DomainEventDeliveryState @default(PENDING)
  attemptCount Int @default(0)
  availableAt  DateTime @default(now())
  lockedAt     DateTime?
  lockToken    String?
  leaseExpiresAt DateTime?
  deliveredAt  DateTime?
  lastError    String?
  event        DomainEventOutbox @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, consumer])
  @@index([consumer, state, availableAt])
  @@index([consumer, state, leaseExpiresAt])
}
```

Reuse the existing `AttachmentCategory.COMPLETION_PHOTO`; add reverse relations on `Attachment`, `UserAccount`, `VendorProfile`, `RepairRequest`, and `Cost`; and `vendorPaymentRequest VendorPaymentRequest?` on `Cost`. The join table makes every attachment belong to at most one immutable completion report. The nullable unique `VendorPaymentRequest.costId` relation is authoritative after settlement, while legacy `Cost.paymentRef=repairId` remains a compatibility projection owned by the later credit transaction.

The SQL migration must, in order:

1. Assert both foundation migrations have already removed `VendorProfile.userId` and created `VendorAccountLink`.
2. Create all workflow enums/tables/FKs/checks, including `amount > 0`, positive integral line quantities/unit amounts, `lineAmount > 0`, immutable event rows, and unique `(eventId, consumer)` delivery receipts. Enforce `attemptCount >= 0`; `PENDING` requires lock/lease/delivered fields null, `PROCESSING` requires `lockedAt`/`lockToken`/`leaseExpiresAt` and no `deliveredAt`, and `DELIVERED` requires `deliveredAt` with lock/lease cleared. A DB trigger on `CREDIT_EVALUATION` delivery insert must require its parent event to contain `managerId`, `paymentRequestId`, `completionDecisionId`, and `actorUserId`; manager-approved TENANT/PENDING completion may still create a notification-only approval event without a payment request.
3. Backfill one `ManagerVendor(ACTIVE)` per non-null legacy `createdByManagerId`, then stop all projector reads/writes of `createdByManagerId`; drop that legacy column only after the backfill succeeds.
4. Backfill every positive legacy `RepairRequest.estimateAmount` to v1 `FIXED_ESTIMATE` plus one deterministic line item. Map `ESTIMATE_SUBMITTED` to `SUBMITTED`; map `estimateApprovedAt IS NOT NULL` and post-approval repair states to `APPROVED`; do not infer missing trades or amounts.
5. Convert legacy completion photo URLs into deterministic `Attachment(category=COMPLETION_PHOTO)` rows, then backfill v1 `VendorCompletionReport` and `VendorCompletionReportAttachment` joins in source array order. Backfill `COMPLETED` as `LEGACY_MIGRATION` decisions only—never enqueue credit evaluation.
6. For legacy `COMPLETION_REPORTED` rows with `costBearer=LANDLORD` and an approved estimate, create one `WAITING_COMPLETION` payment request and `REQUESTED` audit row in the same migration transaction. Leave existing `Cost` and `Cost.paymentRef` unchanged. Do not manufacture completion-approval events or credit deliveries for legacy decisions.
7. Before enforcing one active repair, rank non-final repairs by `createdAt DESC, id DESC` per ticket and mark every row after rank 1 `CANCELLED`; set `Ticket.assignedVendorId` from the retained newest active repair. This implements the approved definition of one active repair without deleting history.
8. Add database-only partial indexes:

```sql
CREATE UNIQUE INDEX "one_active_repair_per_ticket"
  ON "RepairRequest" ("ticketId") WHERE "status" NOT IN ('COMPLETED','CANCELLED');
CREATE UNIQUE INDEX "one_submitted_estimate_per_repair"
  ON "VendorEstimate" ("repairId") WHERE "status" = 'SUBMITTED';
CREATE UNIQUE INDEX "one_approved_estimate_per_repair"
  ON "VendorEstimate" ("repairId") WHERE "status" = 'APPROVED';
```

Keep legacy estimate/completion scalar columns temporarily as read compatibility fields, but no new command may write them. Update `PrismaStoreProjector` so it neither overwrites workflow tables nor tries to project the removed `createdByManagerId`; missing workflow collections in old snapshots remain equivalent to empty read models.

- [ ] **Step 4: Generate Prisma, apply the migration to the dedicated test DB, and verify GREEN**

Run:

```bash
pnpm run db:generate
DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm exec prisma migrate deploy
ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.schema.spec.ts
```

Expected: generate/deploy exit `0`; the schema test reports `1 pass, 0 fail`. If the test DB is not disposable and clean, create a dedicated database instead of resetting shared/local development data.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260714110000_vendor_workflow/migration.sql apps/api/src/roomlog/prisma-store-projector.ts apps/api/src/roomlog/vendor-workflow.schema.spec.ts
git commit -m "feat: persist vendor workflow history"
```

### Task 3: Implement Manager Vendor Registration and Read Models

**Files:**
- Create: `apps/api/src/roomlog/manager-vendor.repository.ts`
- Create: `apps/api/src/roomlog/prisma-manager-vendor.repository.ts`
- Create: `apps/api/src/roomlog/services/roomlog-manager-vendor.domain.ts`
- Test: `apps/api/src/roomlog/prisma-manager-vendor.repository.spec.ts`
- Test: `apps/api/src/roomlog/services/roomlog-manager-vendor.domain.spec.ts`

**Interfaces:**
- Consumes: foundation `VendorCatalogRecord` table/projection and active `VendorAccountLink`; Task 1 `ManagerVendorView`, `ManagerVendorDetail`, `VendorCatalogSearchFilters`, `VendorCatalogSearchResult`
- Produces: `ManagerVendorRepository.searchCatalog/list/getDetail/register/updateNote/archive`, `RoomlogManagerVendorDomain` methods with the same scope-safe behavior

- [ ] **Step 1: Write failing repository tests for idempotent registration and manager isolation**

```ts
it("reactivates one manager-vendor row without editing the catalog", async () => {
  const first = await repository.register("manager-a", "vendor-1");
  await repository.updateNote("manager-a", "vendor-1", "주말 출동 가능");
  await repository.archive("manager-a", "vendor-1");
  const restored = await repository.register("manager-a", "vendor-1");
  assert.equal(restored.id, first.id);
  assert.equal(restored.status, "ACTIVE");
  assert.equal(restored.managerNote, "주말 출동 가능");
  assert.equal((await repository.list("manager-b", {})).length, 0);
  assert.equal((await prisma.vendorProfile.findUniqueOrThrow({ where: { id: "vendor-1" } })).businessName, "원장 상호");
});

it("searches the global catalog but marks only this manager's registration", async () => {
  const rows = await repository.searchCatalog("manager-a", { query: "원장", serviceArea: "성동" });
  assert.deepEqual(rows.map((row) => [row.catalog.id, row.registrationStatus]), [["vendor-1", "ACTIVE"]]);
});
```

Also test: missing catalog vendor → 404, manager B cannot read/update manager A's relation, archive preserves completed/active job counts, and account status is derived from `VendorAccountLink` rather than catalog duplication.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-manager-vendor.repository.spec.ts src/roomlog/services/roomlog-manager-vendor.domain.spec.ts`

Expected: FAIL with `Cannot find module './prisma-manager-vendor.repository'` and missing domain/repository symbols.

- [ ] **Step 3: Implement the repository with catalog-read/relationship-write separation**

```ts
// apps/api/src/roomlog/manager-vendor.repository.ts
export const MANAGER_VENDOR_REPOSITORY = Symbol("MANAGER_VENDOR_REPOSITORY");
export interface ManagerVendorRepository {
  searchCatalog(managerId: string, filters: VendorCatalogSearchFilters): Promise<VendorCatalogSearchResult[]>;
  list(managerId: string, filters: VendorCatalogSearchFilters): Promise<ManagerVendorView[]>;
  getDetail(managerId: string, vendorId: string): Promise<ManagerVendorDetail | null>;
  register(managerId: string, vendorId: string): Promise<ManagerVendorView>;
  updateNote(managerId: string, vendorId: string, managerNote: string | null): Promise<ManagerVendorView>;
  archive(managerId: string, vendorId: string): Promise<ManagerVendorView>;
}
```

Implement the Prisma commands as awaited writes, never via `RoomlogStore`:

```ts
async register(managerId: string, vendorId: string) {
  return this.prisma.$transaction(async (tx) => {
    await tx.vendorProfile.findUniqueOrThrow({ where: { id: vendorId } });
    await tx.managerVendor.upsert({
      where: { managerId_vendorId: { managerId, vendorId } },
      create: { id: this.ids.next("mvd"), managerId, vendorId, status: "ACTIVE" },
      update: { status: "ACTIVE" }
    });
    return this.projectOne(tx, managerId, vendorId);
  });
}
```

`searchCatalog` may show unlinked/inactive rows for inspection; `list` must return only this manager's relationship rows. `archive` updates `status=ARCHIVED` and does not delete or cancel existing jobs. `getDetail` derives numeric performance only from this manager's accessible completed repairs; do not recreate the current AI performance comment.

The domain trims notes, maps Prisma missing rows to `NotFoundException`, and exposes no method that accepts catalog fields such as `businessName`, `phone`, `trades`, or `serviceAreas` for writes.

- [ ] **Step 4: Run repository/domain tests to verify GREEN**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-manager-vendor.repository.spec.ts src/roomlog/services/roomlog-manager-vendor.domain.spec.ts`

Expected: all registration, archive/reactivation, search, note, and manager isolation cases pass; no test is skipped when the Docker test DB is running.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/roomlog/manager-vendor.repository.ts apps/api/src/roomlog/prisma-manager-vendor.repository.ts apps/api/src/roomlog/services/roomlog-manager-vendor.domain.ts apps/api/src/roomlog/prisma-manager-vendor.repository.spec.ts apps/api/src/roomlog/services/roomlog-manager-vendor.domain.spec.ts
git commit -m "feat: add manager vendor relationships"
```

### Task 4: Enforce Assignment Guards and Preserve Reassignment History

**Files:**
- Create: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Create: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Create: `apps/api/src/roomlog/vendor-trade-compatibility.ts`
- Create: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts`
- Create: `apps/api/src/domain-events/domain-event.repository.ts`
- Create: `apps/api/src/domain-events/prisma-domain-event.repository.ts`
- Test: `apps/api/src/roomlog/prisma-vendor-workflow.assignment.spec.ts`
- Test: `apps/api/src/roomlog/vendor-trade-compatibility.spec.ts`

**Interfaces:**
- Consumes: foundation catalog/account tables, Task 2 `ManagerVendor`/workflow schema, authenticated `managerId`
- Produces: `AssignVendorCommand`, `VendorWorkflowRepository.assignVendor`, deterministic `requiredVendorTrade(category)`, `RoomlogVendorWorkflowDomain.assignVendor`, transaction-aware `DomainEventRepository.enqueue(tx, event)`

- [ ] **Step 1: Write failing guard, idempotency, and reassignment tests**

```ts
it("requires verified active linked registered and trade-compatible vendor", async () => {
  for (const invalid of ["PENDING_VERIFICATION", "INACTIVE", "UNLINKED", "ARCHIVED", "TRADE_MISMATCH"] as const) {
    await arrangeVendorState(invalid);
    await assert.rejects(
      repository.assignVendor({ managerId: "manager-a", ticketId: "ticket-1", vendorId: "vendor-1", requestNote: "누수 점검" }),
      /배정할 수 없습니다/
    );
    assert.equal(await prisma.repairRequest.count({ where: { ticketId: "ticket-1" } }), 0);
  }
});

it("returns the same active assignment and closes the old repair on reassignment", async () => {
  const first = await repository.assignVendor(command("vendor-1"));
  const retry = await repository.assignVendor(command("vendor-1"));
  assert.equal(retry.id, first.id);
  const second = await repository.assignVendor(command("vendor-2"));
  assert.notEqual(second.id, first.id);
  assert.equal((await prisma.repairRequest.findUniqueOrThrow({ where: { id: first.id } })).status, "CANCELLED");
  assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: "ticket-1" } })).assignedVendorId, "vendor-2");
});
```

Assert the valid transaction also creates exactly one outbox row with `eventKey=vendor-job-assigned:<repairId>` addressed to the active vendor account user.

- [ ] **Step 2: Run assignment tests to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-trade-compatibility.spec.ts src/roomlog/prisma-vendor-workflow.assignment.spec.ts`

Expected: FAIL with missing `VendorWorkflowRepository`/`requiredVendorTrade` modules.

- [ ] **Step 3: Implement deterministic compatibility and one transaction for assignment**

```ts
// vendor-trade-compatibility.ts — deterministic product mapping, never AI inference
const CATEGORY_TO_TRADE = new Map<string, string>([
  ["냉난방", "hvac"], ["에어컨", "hvac"], ["보일러", "hvac"],
  ["배관/수전", "plumbing"], ["누수", "plumbing"], ["전기", "electrical"],
  ["출입/보안", "locksmith"], ["방수", "waterproofing"], ["청소", "cleaning"],
  ["가전", "appliance"], ["창호", "general"]
]);
export function requiredVendorTrade(category: string): string {
  return CATEGORY_TO_TRADE.get(category.trim()) ?? "general";
}
```

```ts
export interface AssignVendorCommand {
  managerId: string;
  ticketId: string;
  vendorId: string;
  requestNote: string;
}

async assignVendor(command: AssignVendorCommand): Promise<VendorJobDetail> {
  return this.prisma.$transaction(async (tx) => {
    const ticket = await lockTicketForUpdate(tx, command.ticketId);
    await assertManagerOwnsTicket(tx, command.managerId, ticket);
    const candidate = await loadCatalogAccountAndManagerRelation(tx, command.managerId, command.vendorId);
    assertAssignable(candidate, requiredVendorTrade(ticket.category));

    const current = await findActiveRepair(tx, ticket.id);
    if (current?.vendorId === command.vendorId) return projectJob(tx, current.id);
    if (current) await tx.repairRequest.update({ where: { id: current.id }, data: { status: "CANCELLED" } });

    const repair = await tx.repairRequest.create({ data: {
      id: ids.next("rep"), ticketId: ticket.id, vendorId: command.vendorId,
      status: "REQUESTED", title: `${ticket.category} 처리 요청`,
      description: requiredText(command.requestNote), completionPhotoUrls: []
    }});
    await tx.ticket.update({ where: { id: ticket.id }, data: { assignedVendorId: command.vendorId, status: "VENDOR_ASSIGNED" } });
    await insertOutbox(tx, {
      eventKey: `vendor-job-assigned:${repair.id}`, type: "VENDOR_JOB_ASSIGNED",
      targetUserIds: [candidate.activeAccountUserId], vendorId: command.vendorId,
      repairId: repair.id, statusCode: "REQUESTED"
    });
    return projectJob(tx, repair.id);
  });
}
```

Use `SELECT ... FOR UPDATE` or an equivalent transaction-safe lock for the ticket. Catch the partial unique index error, reload the active repair, and return it only when it is the same vendor; never hide a different-vendor race. The domain accepts only session-derived `managerId`, trims `requestNote`, and does not invoke `transitionTicket`/`persistStore` before this transaction.

The shared writer must accept the caller's transaction so the state row and outbox row cannot commit separately:

```ts
export const DOMAIN_EVENT_REPOSITORY = Symbol("DOMAIN_EVENT_REPOSITORY");
export interface DomainEventOutboxRecord extends RoomlogDomainEvent {
  id: string;
  completionDecisionId?: string;
  actorUserId?: string;
}
export type DomainEventConsumer = "NOTIFICATION" | "CREDIT_EVALUATION";
export interface DomainEventDeliveryRecord {
  id: string; lockToken: string;
  consumer: DomainEventConsumer;
  state: "PROCESSING";
  attemptCount: number;
  leaseExpiresAt: string;
  event: DomainEventOutboxRecord;
}
export interface DomainEventRepository {
  enqueue(tx: Prisma.TransactionClient, input: {
    event: RoomlogDomainEvent;
    consumers: readonly DomainEventConsumer[];
  }): Promise<{ eventId: string }>;
  claimPending(consumer: DomainEventConsumer, limit: number, now: Date, leaseUntil: Date): Promise<DomainEventDeliveryRecord[]>;
  markDelivered(deliveryId: string, lockToken: string, deliveredAt: Date): Promise<boolean>;
  reschedule(deliveryId: string, lockToken: string, availableAt: Date, lastError: string): Promise<boolean>;
}
```

모든 호출자는 consumer를 명시하며 일반 이벤트는 `["NOTIFICATION"]`, 결제요청이 있는 완료 승인 transaction만 `["NOTIFICATION", "CREDIT_EVALUATION"]`를 사용한다. `enqueue`는 canonical payload SHA-256을 저장하고 동일 `eventKey`/동일 hash면 기존 event와 빠진 consumer만 재사용하지만, 같은 key/다른 hash면 `409 Conflict`다. `occurredAt`은 재시도 시 새 clock 값을 만들지 않고 원 상태 row의 `createdAt/decidedAt/processedAt`을 사용하므로 hash가 안정적이다. `claimPending`은 `PENDING` 중 도래한 행과 lease가 만료된 `PROCESSING` 행을 한 transaction에서 `FOR UPDATE SKIP LOCKED`로 가져와 무작위 `lockToken`과 60초 lease를 부여한다. 완료/재예약은 `(deliveryId, lockToken, state=PROCESSING)` CAS여야 하므로 lease가 만료된 구 worker가 새 worker 결과를 덮을 수 없다. event 자체에는 published 상태를 두지 않으며 한 consumer의 `markDelivered`가 다른 consumer receipt를 바꾸지 않는다.

- [ ] **Step 4: Run assignment tests to verify GREEN**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-trade-compatibility.spec.ts src/roomlog/prisma-vendor-workflow.assignment.spec.ts`

Expected: all five guard cases, same-vendor retry, reassignment history, manager ownership, and transactional outbox assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/roomlog/vendor-workflow.repository.ts apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/api/src/roomlog/vendor-trade-compatibility.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts apps/api/src/domain-events/domain-event.repository.ts apps/api/src/domain-events/prisma-domain-event.repository.ts apps/api/src/roomlog/prisma-vendor-workflow.assignment.spec.ts apps/api/src/roomlog/vendor-trade-compatibility.spec.ts
git commit -m "feat: guard vendor assignment workflow"
```

### Task 5: Implement Versioned Estimates, Visit Scheduling, and Job Progress

**Files:**
- Modify: `packages/types/src/vendor-workflow.ts`
- Modify: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts`
- Create: `apps/api/src/roomlog/vendor-completion-attachment.service.ts`
- Test: `apps/api/src/roomlog/prisma-vendor-workflow.estimate.spec.ts`
- Test: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts`

**Interfaces:**
- Consumes: foundation `VendorAccountResolver.resolveActiveVendorId(userId): Promise<string | undefined>`; Task 1 estimate types; Task 4 assigned repair
- Produces: `VendorWorkflowRepository.listJobs/getJob/saveEstimateDraft/submitEstimate/withdrawEstimate/reviewEstimate/confirmEstimateVisit/scheduleApprovedJob/startJob`, `VendorVisitScheduleInput`, vendor/manager workflow domain methods

- [ ] **Step 1: Write failing estimate state-machine and ownership tests**

```ts
it("recalculates fixed lines on the server and locks the approved snapshot", async () => {
  const draft = await repository.saveEstimateDraft({
    vendorId: "vendor-1", repairId: "repair-1",
    input: { responseType: "FIXED_ESTIMATE", workDescription: "배관 교체", lineItems: [
      { category: "VISIT", description: "출장", quantity: 1, unitAmount: 30000 },
      { category: "MATERIAL", description: "배관", quantity: 2, unitAmount: 45000 }
    ] }
  });
  assert.deepEqual(draft.lineItems.map((line) => line.lineAmount), [30000, 90000]);
  assert.equal(draft.totalAmount, 120000);
  const submitted = await repository.submitEstimate("vendor-1", "repair-1", draft.id);
  const approved = await repository.reviewEstimate("manager-a", "repair-1", submitted.id, {
    action: "APPROVE", costBearer: "LANDLORD"
  });
  assert.equal(approved.status, "APPROVED");
  await assert.rejects(() => repository.saveEstimateDraft({ vendorId: "vendor-1", repairId: "repair-1", estimateId: approved.id, input: changedInput }), /승인 견적/);
});

it("preserves visit and revision versions without treating a visit as approval", async () => {
  const visit = await createAndSubmitVisitEstimate();
  const scheduled = await repository.confirmEstimateVisit("manager-a", "repair-1", visit.id, { scheduledAt: "2026-07-16T01:00:00.000Z" });
  assert.equal(scheduled.estimate.status, "VISIT_SCHEDULED");
  assert.equal(await prisma.vendorEstimate.count({ where: { repairId: "repair-1", status: "APPROVED" } }), 0);
  const fixedV2 = await repository.saveEstimateDraft({ vendorId: "vendor-1", repairId: "repair-1", input: fixedInput });
  assert.equal(fixedV2.version, 2);
  assert.equal((await prisma.vendorEstimate.findUniqueOrThrow({ where: { id: visit.id } })).status, "SUPERSEDED");
});
```

Add cases for: empty/zero/non-integer line data, visit missing date/reason, decline missing reason, vendor B access, manager B review, withdrawal only from `DRAFT` or unreviewed `SUBMITTED`, revision/rejection note required, only `FIXED_ESTIMATE` approval, one `SUBMITTED` estimate per repair, old approved estimate superseded only when the new version is approved, schedule/start legal states, and completion blocked while a changed estimate is `SUBMITTED` or `REVISION_REQUESTED`.

- [ ] **Step 2: Run focused estimate tests to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-vendor-workflow.estimate.spec.ts src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts`

Expected: FAIL because the repository lacks the estimate/job methods and foundation identity resolution is not wired into the domain.

- [ ] **Step 3: Implement the discriminated state machine with server totals**

Add shared scheduling inputs:

```ts
export interface VendorVisitScheduleInput { scheduledAt: string; }
export interface StartVendorJobResult { repairId: string; status: "IN_PROGRESS"; startedAt: string; }
```

Extend the repository interface with exact signatures:

```ts
listJobs(vendorId: string): Promise<VendorJobSummary[]>;
getJob(vendorId: string, repairId: string): Promise<VendorJobDetail | null>;
saveEstimateDraft(command: { vendorId: string; repairId: string; estimateId?: string; input: VendorEstimateDraftInput }): Promise<VendorEstimate>;
submitEstimate(vendorId: string, repairId: string, estimateId: string): Promise<VendorEstimate>;
withdrawEstimate(vendorId: string, repairId: string, estimateId: string): Promise<VendorEstimate>;
reviewEstimate(managerId: string, repairId: string, estimateId: string, input: VendorEstimateReviewInput): Promise<VendorEstimate>;
confirmEstimateVisit(managerId: string, repairId: string, estimateId: string, input: VendorVisitScheduleInput): Promise<VendorJobDetail>;
scheduleApprovedJob(vendorId: string, repairId: string, input: VendorVisitScheduleInput): Promise<VendorJobDetail>;
startJob(vendorId: string, repairId: string): Promise<StartVendorJobResult>;
```

Use this validation/transaction algorithm:

```ts
function normalizedDraft(input: VendorEstimateDraftInput) {
  if (input.responseType === "FIXED_ESTIMATE") {
    const lines = input.lineItems.map((line, sortOrder) => {
      assertNonEmpty(line.description);
      assertPositiveInteger(line.quantity);
      assertPositiveInteger(line.unitAmount);
      return { ...line, sortOrder, lineAmount: line.quantity * line.unitAmount };
    });
    assert(lines.length > 0);
    return { ...input, lineItems: lines, totalAmount: lines.reduce((sum, line) => sum + line.lineAmount, 0) };
  }
  if (input.responseType === "VISIT_REQUIRED") return { ...requireVisitDateAndReason(input), lineItems: [], totalAmount: null };
  return { ...requireDeclineReason(input), lineItems: [], totalAmount: null };
}

// review APPROVE transaction
lockRepairAndAssertManagerOwnership();
assert(candidate.status === "SUBMITTED" && candidate.responseType === "FIXED_ESTIMATE");
await tx.vendorEstimate.updateMany({ where: { repairId, status: "APPROVED", id: { not: candidate.id } }, data: { status: "SUPERSEDED" } });
await tx.vendorEstimate.update({ where: { id: candidate.id }, data: {
  status: "APPROVED", reviewedAt: now, reviewedByManagerId: managerId,
  reviewNote: input.note ?? null
}});
await tx.repairRequest.update({ where: { id: repairId }, data: {
  status: "ESTIMATE_APPROVED", costBearer: input.costBearer
}});
await insertOutbox(tx, stableEstimateReviewEvent(candidate.id, input.action));
```

New versions use `MAX(version)+1` while the repair row is locked. A revision-requested, visit-scheduled, rejected, withdrawn, or previous approved row is never overwritten. Submitting a changed fixed version leaves the previous `APPROVED` row in place until manager approval, but the presence of a current `SUBMITTED`/`REVISION_REQUESTED` version blocks completion. `DECLINED` becomes `DECLINED` immediately on submit and creates no payment surface. Every submit/review transaction inserts one stable outbox event; duplicate retries return the current row and do not add another event.

The domain resolves vendor identity before every vendor call:

```ts
const vendorId = await this.vendorAccounts.resolveActiveVendorId(userId);
if (!vendorId) throw new ForbiddenException("활성 업체 계정으로만 접근할 수 있습니다.");
return this.repository.saveEstimateDraft({ vendorId, repairId, estimateId, input });
```

Do not accept `vendorId` in any public vendor input. Manager methods receive only the authenticated manager ID from the controller.

- [ ] **Step 4: Run estimate/job tests to verify GREEN**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-vendor-workflow.estimate.spec.ts src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts`

Expected: all fixed/visit/decline, versioning, scope, immutable approval, outbox, schedule, and start-state tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/vendor-workflow.ts apps/api/src/roomlog/vendor-workflow.repository.ts apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts apps/api/src/roomlog/prisma-vendor-workflow.estimate.spec.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts
git commit -m "feat: add versioned vendor estimates"
```

### Task 6: Commit Completion Evidence, Payment Requests, and Durable Consumer Delivery

**Files:**
- Modify: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts`
- Create: `apps/api/src/roomlog/vendor-completion-attachment.service.ts`
- Create: `apps/api/src/roomlog/vendor-completion-credit.boundary.ts`
- Create: `apps/api/src/roomlog/completion-credit-delivery.worker.ts`
- Modify: `apps/api/src/domain-events/domain-event.repository.ts`
- Modify: `apps/api/src/domain-events/prisma-domain-event.repository.ts`
- Create: `apps/api/src/domain-events/domain-event.dispatcher.ts`
- Create: `apps/api/src/domain-events/domain-events.module.ts`
- Test: `apps/api/src/roomlog/prisma-vendor-workflow.completion.spec.ts`
- Test: `apps/api/src/domain-events/domain-event.dispatcher.spec.ts`
- Test: `apps/api/src/roomlog/completion-credit-delivery.worker.spec.ts`
- Test: `apps/api/src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`

**Interfaces:**
- Consumes: Task 5 approved estimate/job, `RealtimeGateway.notifyUsers`
- Produces: `VendorWorkflowRepository.saveCompletionAttachment/submitCompletion/decideCompletion/listSettlements`, `VendorCompletionAttachmentService`, `CompletionCommit`, `DecisionCommit`, consumer-aware `DomainEventDispatcher.dispatchPending`, `CompletionCreditDeliveryWorker.dispatchPending`, `VendorCompletionCreditBoundary`, `DeferredVendorCompletionCreditBoundary`; the only future workflow→credit port

- [ ] **Step 1: Write failing atomicity, idempotency, individual-decision, and post-commit tests**

```ts
it("creates one immutable LANDLORD report and payment request from the approved estimate", async () => {
  const input = { workSummary: "교체 완료", completedAt: "2026-07-14T10:00:00.000Z", attachmentIds: ["att-1"], submissionKey: "done-1" };
  const first = await repository.submitCompletion("vendor-1", "repair-1", input);
  const retry = await repository.submitCompletion("vendor-1", "repair-1", input);
  assert.equal(retry.report.id, first.report.id);
  assert.equal(retry.paymentRequest?.id, first.paymentRequest?.id);
  assert.equal(first.paymentRequest?.amount, 120000);
  assert.equal(first.paymentRequest?.approvedEstimateId, "estimate-approved");
  assert.equal(first.paymentRequest?.status, "WAITING_COMPLETION");
  await assert.rejects(
    () => repository.submitCompletion("vendor-1", "repair-1", { ...input, workSummary: "다른 payload" }),
    /submissionKey.*충돌/
  );
});

it("stores reports but no manager request for TENANT or PENDING", async () => {
  for (const costBearer of ["TENANT", "PENDING"] as const) {
    await arrangeRepair({ costBearer });
    const result = await repository.submitCompletion("vendor-1", repairIdFor(costBearer), completionInput(costBearer));
    assert.ok(result.report.id);
    assert.equal(result.paymentRequest, undefined);
  }
});

it("commits approval, audit, notification and credit deliveries before any consumer runs", async () => {
  const result = await domain.decideCompletion("manager-a", "repair-1", { decision: "APPROVED" });
  assert.equal(result.decision.source, "MANAGER");
  const event = await prisma.domainEventOutbox.findUniqueOrThrow({
    where: { eventKey: `vendor-completion-approved:${result.decision.id}` },
    include: { deliveries: true }
  });
  assert.deepEqual(event.deliveries.map((row) => row.consumer).sort(), ["CREDIT_EVALUATION", "NOTIFICATION"]);
  assert.equal(await prisma.vendorPaymentAuditEvent.count({ where: { decisionId: result.decision.id, type: "COMPLETION_APPROVED" } }), 1);
  assert.equal((await prisma.repairRequest.findUniqueOrThrow({ where: { id: "other-repair-on-ticket" } })).status, "COMPLETION_REPORTED");
});
```

Also test: attachment IDs belong to this repair and category, missing approved estimate/pending changed estimate blocks atomic LANDLORD submission, latest approved report blocks another report, rejection note is mandatory, rejected report allows v+1 and moves the same request's `completionReportId`, one decision per report, manager B cannot decide, migration decision creates no credit delivery, same normalized decision+note retry returns the existing decision while a changed decision or note conflicts, LANDLORD approved/rejected decisions append exactly one deterministic payment audit row, TENANT/PENDING approval creates notification only and no payment audit/credit delivery, rejected decisions create notification only, deferred mode leaves `WAITING_COMPLETION` and the credit delivery unclaimed, worker crash/lease expiry reclaims the same delivery, notification success does not mark credit delivered, boundary failure stays retryable, and repeated delivery uses one stable event/decision ID. In the dispatcher lifecycle spec, persist unhandled assignment/estimate/approval notification receipts, construct a new dispatcher, run bootstrap, and prove every due receipt drains once without an HTTP wakeup. `WAITING_COMPLETION`은 결제 취소 대상이 아니라 완료 승인/반려 대기 상태다. 관리자는 완료를 반려할 수 있고, credit 취소 API는 이후 `PENDING_APPROVAL`/`INSUFFICIENT_CREDIT`만 다룬다.

- [ ] **Step 2: Run completion/event tests to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-vendor-workflow.completion.spec.ts src/domain-events/domain-event.dispatcher.spec.ts src/roomlog/completion-credit-delivery.worker.spec.ts src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`

Expected: FAIL with missing completion repository methods/shared dispatcher/credit port.

- [ ] **Step 3: Implement canonical payload hashing and atomic report/request creation**

Add a dedicated attachment path instead of using the current store→async-projector `/attachments` command. `VendorCompletionAttachmentService` validates image MIME/10 MB, resolves `vendorId`, verifies the repair belongs to it, saves bytes through the existing `FileStorageAdapter`, then awaits `repository.saveCompletionAttachment({ vendorId, userId, repairId, fileName, fileUrl, mimeType, sizeBytes, category: "COMPLETION_PHOTO" })`. The repository inserts the `Attachment` row directly in Prisma and returns its ID; completion submission later consumes only those IDs. A storage success followed by DB failure is logged as an orphan object for cleanup and is never presented as a successful attachment record.

```ts
export interface SaveVendorCompletionAttachmentCommand {
  vendorId: string; userId: string; repairId: string;
  fileName: string; fileUrl: string; mimeType: string; sizeBytes: number;
  category: "COMPLETION_PHOTO";
}
// on VendorWorkflowRepository
saveCompletionAttachment(command: SaveVendorCompletionAttachmentCommand): Promise<{ attachmentId: string; fileUrl: string }>;

export interface CompletionCommit {
  report: VendorCompletionReport;
  paymentRequest?: VendorPaymentRequest;
  eventKeys: string[];
}
export interface DecisionCommit {
  decision: RepairCompletionDecision;
  paymentRequest?: VendorPaymentRequest;
  eventKey: string;
}
```

Use sorted attachment IDs and normalized text/date in a SHA-256 payload hash. The transaction algorithm is:

```ts
lockRepair();
assertRepairBelongsToVendor(vendorId);
const existingByKey = await tx.vendorCompletionReport.findUnique({ where: { submissionKey } });
if (existingByKey) return sameHash(existingByKey, payloadHash) ? projectExisting() : conflict409();
assertNoApprovedDecisionForLatestReport();
assertNoSubmittedOrRevisionRequestedEstimate();
const attachments = validateAttachmentUploaderAndCategory(activeVendorAccountUserIds, "COMPLETION_PHOTO");

const report = await tx.vendorCompletionReport.create({ data: {
  id: ids.next("vcr"), repairId, vendorId, version: latestVersion + 1,
  workSummary, completedAt, submissionKey, payloadHash,
  attachments: { create: uniqueSortedIds.map((attachmentId, sortOrder) => ({ attachmentId, sortOrder })) }
}});

if (repair.costBearer === "LANDLORD") {
  const approved = requireCurrentApprovedFixedEstimate();
  const request = await tx.vendorPaymentRequest.upsert({
    where: { repairId },
    create: {
      id: ids.next("vpr"), repairId, vendorId, managerId: ticket.room.landlordId,
      approvedEstimateId: approved.id, completionReportId: report.id,
      amount: approved.totalAmount, status: "WAITING_COMPLETION"
    },
    update: { completionReportId: report.id } // only while WAITING_COMPLETION after rejection
  });
  await appendRequestedAuditIfFirst(tx, request.id);
}
await insertOutbox(tx, completionSubmittedEvent(report, request));
return projectCommit();
```

Never accept an amount in `SubmitVendorCompletionInput`. Keep `VendorPaymentRequest.costId` null and leave `Cost.paymentRef` untouched; the credit settlement transaction is the only writer that later creates/links a cost.

- [ ] **Step 4: Implement one-repair decisions and durable per-consumer delivery**

The decision transaction locks the repair and latest report, validates manager ownership, and normalizes `decision` plus trimmed `note`. If that report already has a decision, the exact same normalized payload returns it; a different decision or note is `409 Conflict` and cannot alter event/audit history. A new `RepairCompletionDecision(source=MANAGER)` updates only that `RepairRequest` and writes `vendor-completion-approved:<decisionId>` or `vendor-completion-rejected:<decisionId>` as the unique outbox key. When a LANDLORD payment request exists, it also appends one `VendorPaymentAuditEvent` with deterministic `dedupeKey`, `decisionId`, and type `COMPLETION_APPROVED`/`COMPLETION_REJECTED`; non-payment TENANT/PENDING completion decisions do not manufacture payment audit rows. The audit `decisionId @unique` and outbox `eventKey @unique` keep retries duplicate-free. An approved LANDLORD event carries the committed `managerId`, `paymentRequestId`, `completionDecisionId`, and `actorUserId=managerId` and uses `["NOTIFICATION", "CREDIT_EVALUATION"]`; approval without a payment request and every rejection use `["NOTIFICATION"]`. `REJECTED` leaves any existing request `WAITING_COMPLETION`; `APPROVED` does not itself change payment status or pin `completionDecisionId`.

```ts
async decideCompletion(managerId: string, repairId: string, input: DecideRepairCompletionInput) {
  const committed = await this.repository.decideCompletion(managerId, repairId, input);
  await this.events.dispatchPending(25).catch(() => undefined); // latency optimization only
  return committed; // durable delivery rows, not this best-effort tick, guarantee later work
}
```

`DomainEventDispatcher` in the independent `DomainEventsModule` implements `OnModuleInit`/`OnModuleDestroy`, runs an immediate tick plus an unref'ed 5-second interval, claims only `NOTIFICATION` deliveries, sends the stable realtime notification outside the originating transaction, then marks that delivery—not the event—delivered:

```ts
for (const delivery of await repository.claimPending("NOTIFICATION", limit, now, leaseUntil)) {
  try {
    this.realtime.notifyUsers(delivery.event.targetUserIds, "roomlog-domain-event", publicEvent(delivery.event));
    await repository.markDelivered(delivery.id, delivery.lockToken, clock.now());
  } catch (error) {
    await repository.reschedule(delivery.id, delivery.lockToken, backoff(delivery.attemptCount), boundedError(error));
  }
}
```

The workflow-owned port mirrors the future credit method but includes an explicit independent-slice result:

```ts
export const VENDOR_COMPLETION_CREDIT_BOUNDARY = Symbol("VENDOR_COMPLETION_CREDIT_BOUNDARY");
export interface VendorCompletionCreditBoundary {
  readonly availability: "DEFERRED" | "READY";
  evaluateAfterCompletion(input: Readonly<{
    managerId: string;
    paymentRequestId: string;
    completionDecisionId: string;
    actorUserId: string;
  }>): Promise<
    | { outcome: "DEFERRED"; paymentRequestId: string }
    | { outcome: "AUTO_PAID"; paymentRequestId: string; ledgerEntryId: string }
    | { outcome: "PENDING_APPROVAL" | "INSUFFICIENT_CREDIT"; paymentRequestId: string }
    | { outcome: "ALREADY_FINAL"; paymentRequestId: string; status: "AUTO_PAID" | "MANUAL_CREDIT_PAID" | "DIRECT_PAID" | "CANCELLED" | "REVERSED" | "DIRECT_PAYMENT_VOIDED" }
  >;
}

export class DeferredVendorCompletionCreditBoundary implements VendorCompletionCreditBoundary {
  readonly availability = "DEFERRED" as const;
  async evaluateAfterCompletion(input: { paymentRequestId: string }) {
    return { outcome: "DEFERRED", paymentRequestId: input.paymentRequestId } as const;
  }
}
```

`CompletionCreditDeliveryWorker` claims only `CREDIT_EVALUATION` deliveries and derives every boundary argument from the committed event; request input cannot replace those IDs:

```ts
export class CompletionCreditDeliveryWorker {
  async dispatchPending(limit = 25): Promise<number> {
    if (this.boundary.availability === "DEFERRED") return 0;
    const deliveries = await this.events.claimPending("CREDIT_EVALUATION", limit, this.clock.now(), leaseAfter(60_000));
    for (const delivery of deliveries) {
      try {
        const event = requireApprovedCompletionEvent(delivery.event);
        const result = await this.boundary.evaluateAfterCompletion({
          managerId: requireManager(event), paymentRequestId: requirePaymentRequest(event),
          completionDecisionId: requireDecision(event), actorUserId: requireActor(event)
        });
        if (result.outcome === "DEFERRED") throw new Error("ready credit adapter returned DEFERRED");
        await this.events.markDelivered(delivery.id, delivery.lockToken, this.clock.now());
      } catch (error) {
        await this.events.reschedule(delivery.id, delivery.lockToken, retryAt(delivery.attemptCount), boundedError(error));
      }
    }
    return deliveries.length;
  }
}
```

Both processors recover expired `PROCESSING` leases, increment `attemptCount` on each claim, bound `lastError`, and use exponential `availableAt`. A stale lock token cannot complete or reschedule a reclaimed row. Missing IDs, or `actorUserId !== managerId` on the manager-triggered approval event, are treated as a bounded poison error and rescheduled/alerted without calling Credit; add a malformed-event test. `DomainEventsModule` imports `RealtimeModule`, owns/exports `DOMAIN_EVENT_REPOSITORY` and `DomainEventDispatcher`, and imports neither `RoomlogModule` nor `CreditModule`. `RoomlogModule` owns the credit worker because it owns the boundary token. At this slice checkpoint `availability=DEFERRED` means the worker does not claim credit rows at all, so they remain `PENDING` without churn. The real adapter sets `READY`; `onModuleInit()` starts an immediate drain and an unref'ed 5-second interval, while `onModuleDestroy()` clears the timer. A process crash before a tick, during a call, or after credit commit but before `markDelivered` is safe: the 60-second lease expires and the exact same `completionDecisionId` is retried.

- [ ] **Step 5: Run completion/event tests to verify GREEN**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/prisma-vendor-workflow.completion.spec.ts src/domain-events/domain-event.dispatcher.spec.ts src/roomlog/completion-credit-delivery.worker.spec.ts src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`

Expected: atomic report/request, retry conflict, per-report decisions/audits, independent notification and credit receipts, expired-lease recovery, deferred reschedule, boundary-failure retry, and no-other-repair mutation tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/roomlog/vendor-workflow.repository.ts apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts apps/api/src/roomlog/vendor-completion-attachment.service.ts apps/api/src/roomlog/vendor-completion-credit.boundary.ts apps/api/src/roomlog/completion-credit-delivery.worker.ts apps/api/src/domain-events/domain-event.repository.ts apps/api/src/domain-events/prisma-domain-event.repository.ts apps/api/src/domain-events/domain-event.dispatcher.ts apps/api/src/domain-events/domain-events.module.ts apps/api/src/roomlog/prisma-vendor-workflow.completion.spec.ts apps/api/src/domain-events/domain-event.dispatcher.spec.ts apps/api/src/roomlog/completion-credit-delivery.worker.spec.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts
git commit -m "feat: commit vendor completion evidence"
```

### Task 7: Wire Scope-Safe HTTP Endpoints and Retire Mutable Legacy Paths

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.module.ts:1-34`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts:82-98,1739-1958`
- Modify: `apps/api/src/roomlog/roomlog.service.ts:47-48,5776-5816,5866-5970`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-mgmt.domain.ts:52-155,273-338`
- Delete: `apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts`
- Test: `apps/api/src/roomlog/vendor-workflow.controller.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–6 domains/repositories/shared `DomainEventsModule`/deferred boundary, foundation `VendorAccountResolver`, existing `requireRole`
- Produces: authenticated manager/vendor REST endpoints; Nest providers for direct Prisma repositories; no direct catalog mutation or legacy mutable estimate/completion route

- [ ] **Step 1: Write failing controller delegation and forbidden-scope tests**

```ts
it("derives manager and vendor identities from auth instead of request bodies", async () => {
  const calls: unknown[] = [];
  const controller = controllerWith({
    authUser: { id: "vendor-user", roles: ["VENDOR"] },
    vendorWorkflow: { saveEstimateDraft: (...args: unknown[]) => { calls.push(args); return {}; } }
  });
  await controller.saveVendorEstimateDraft("Bearer token", "repair-1", undefined, fixedDraft);
  assert.deepEqual(calls, [["vendor-user", "repair-1", undefined, fixedDraft]]);
  assert.equal("vendorId" in fixedDraft, false);
});

it("has no manager catalog create or catalog patch handler", () => {
  const source = readFileSync(join(process.cwd(), "src/roomlog/roomlog.controller.ts"), "utf8");
  assert.doesNotMatch(source, /@Post\("manager\/vendor-mgmt\/vendors"\)/);
  assert.doesNotMatch(source, /@Patch\("manager\/vendor-mgmt\/vendors\/:vendorId"\)/);
  assert.doesNotMatch(source, /manual:|createManagerVendorProfile|updateManagerVendorProfile/);
});
```

Add delegation cases for manager B isolation, vendor role guard, registration/archive/note, assignment, estimate review, visit confirmation, individual completion decision, job/settlement reads, and a test proving credit evaluation is not called from completion submission.

- [ ] **Step 2: Run the controller test to verify RED**

Run: `pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.controller.spec.ts`

Expected: FAIL because the new controller methods/providers do not exist and forbidden legacy handlers are still present.

- [ ] **Step 3: Register direct repositories/domains and the deferred boundary**

In `RoomlogModule`, import the independent `DomainEventsModule`, retain `RealtimeModule` only for existing non-outbox consumers, and register provider factories for `MANAGER_VENDOR_REPOSITORY`, `VENDOR_WORKFLOW_REPOSITORY`, the two domains, `CompletionCreditDeliveryWorker`, and `{ provide: VENDOR_COMPLETION_CREDIT_BOUNDARY, useClass: DeferredVendorCompletionCreditBoundary }`. `DomainEventsModule` itself imports `RealtimeModule` and exports `DOMAIN_EVENT_REPOSITORY` plus `DomainEventDispatcher`. Do not import `CreditModule` or `CreditService`; the credit plan later makes `CreditModule -> DomainEventsModule`, then adds `CreditModule` to `RoomlogModule` and replaces only the boundary token. Repository factories must reject a missing `DATABASE_URL` for mutations instead of silently selecting the in-memory store.

Inject `RoomlogManagerVendorDomain` and `RoomlogVendorWorkflowDomain` directly into `RoomlogController` beside the legacy `RoomlogService`; do not add the new commands back as pass-through methods on the giant service.

- [ ] **Step 4: Expose the exact REST surface and remove old writes**

```text
GET    /manager/vendor-mgmt/vendors
GET    /manager/vendor-mgmt/vendors/:vendorId
GET    /manager/vendor-mgmt/vendors/:vendorId/performance
GET    /manager/vendor-mgmt/search
PUT    /manager/vendor-mgmt/vendors/:vendorId/registration
DELETE /manager/vendor-mgmt/vendors/:vendorId/registration
PATCH  /manager/vendor-mgmt/vendors/:vendorId/manager-note
POST   /manager/tickets/:ticketId/assign-vendor
POST   /manager/repairs/:repairId/estimates/:estimateId/review
POST   /manager/repairs/:repairId/estimates/:estimateId/confirm-visit
POST   /manager/repairs/:repairId/completion-decisions

GET    /vendor/jobs
GET    /vendor/jobs/:repairId
PUT    /vendor/jobs/:repairId/estimate-draft
PUT    /vendor/jobs/:repairId/estimate-draft/:estimateId
POST   /vendor/jobs/:repairId/estimates/:estimateId/submit
POST   /vendor/jobs/:repairId/estimates/:estimateId/withdraw
POST   /vendor/jobs/:repairId/schedule
POST   /vendor/jobs/:repairId/start
POST   /vendor/jobs/:repairId/completion-attachments  (multipart `file`, direct awaited Prisma attachment record)
POST   /vendor/jobs/:repairId/completion-reports
GET    /vendor/settlements
```

Each manager handler calls `requireRole(..., ["LANDLORD"])` and passes `user.id`; each vendor handler calls `requireRole(..., ["VENDOR"])` and passes only `user.id`, allowing the domain to call `VendorAccountResolver.resolveActiveVendorId` and turn `undefined` into 403. Keep legacy GET `/vendor/repairs` and `/vendor/repairs/:repairId` as read-only aliases for one release if existing links require them, but remove/return 410 for old mutable `/estimate`, `/schedule`, `/report-completion`, `/messages`, ticket-wide `/approve-completion`, manager catalog POST/PATCH, and duplicate-candidate routes. Vendor ticket chat is not in the approved workflow scope, so remove the inert `ContactThread` UI rather than retaining a broken endpoint. Remove their `RoomlogService` delegates and the old in-memory vendor-repair domain; preserve unrelated tenant invite code in `roomlog-vendor-mgmt.domain.ts`.

- [ ] **Step 5: Run controller and API suites to verify GREEN**

Run: `pnpm run db:generate && pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.controller.spec.ts && pnpm --filter api test`

Expected: focused controller tests pass, then the full API suite exits `0` with DB tests skipped only when `ROOMLOG_TEST_DATABASE_URL` is intentionally absent.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/roomlog/roomlog.module.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/services/roomlog-vendor-mgmt.domain.ts apps/api/src/roomlog/vendor-workflow.controller.spec.ts
git rm apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts
git commit -m "feat: expose vendor workflow API"
```

### Task 8: Replace Manager Vendor Pages and Ticket Actions with the Real API

**Files:**
- Modify: `apps/web/src/lib/vendor-mgmt-nav.ts:1-23`
- Modify: `apps/web/src/lib/vendor-mgmt-api.ts:1-147`
- Modify: `apps/web/src/lib/demo-vendor-mgmt.ts`
- Modify: `apps/web/src/lib/manager-navigation.ts:128-137`
- Create: `apps/web/src/app/manager/vendor-mgmt/layout.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/actions.ts`
- Create: `apps/web/src/app/manager/vendor-mgmt/vendors/page.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/vendors/[vendorId]/page.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/vendors/[vendorId]/performance/page.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/search/page.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/_components.tsx:1-225`
- Modify: `apps/web/src/app/manager/vendor-mgmt/00/page.tsx:1-60`
- Modify: `apps/web/src/app/manager/vendor-mgmt/01/page.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/02/page.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/03/page.tsx:1-130`
- Create: `apps/web/src/app/manager/ticket/dash/04/actions.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/04/page.tsx:1-64`
- Modify: `apps/web/src/app/manager/ticket/dash/05/page.tsx`
- Modify: `apps/web/src/lib/ticket-manager-api.ts:122-132`
- Test: `apps/web/src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts`
- Test: `apps/web/src/lib/vendor-mgmt-api.spec.ts`
- Modify test: `apps/web/src/lib/manager-navigation.spec.ts:21-27,100-108`

**Interfaces:**
- Consumes: Task 1 manager/catalog/estimate/completion DTOs, Task 7 manager endpoints, credit plan's future `/manager/vendor-mgmt/credit` route only as a link
- Produces: `MANAGER_VENDOR_MGMT_PATHS`, `legacyVendorMgmtRedirect`, read API functions, mutation-only server actions, canonical manager pages and real assignment/completion actions

- [ ] **Step 1: Write failing route, fallback, and no-fake-mutation tests**

```ts
describe("manager vendor workflow navigation", () => {
  it("uses semantic routes and preserves old query links", () => {
    assert.equal(MANAGER_VENDOR_MGMT_PATHS.vendors, "/manager/vendor-mgmt/vendors");
    assert.equal(MANAGER_VENDOR_MGMT_PATHS.vendor("vendor-1"), "/manager/vendor-mgmt/vendors/vendor-1");
    assert.equal(MANAGER_VENDOR_MGMT_PATHS.performance("vendor-1"), "/manager/vendor-mgmt/vendors/vendor-1/performance");
    assert.equal(legacyVendorMgmtRedirect("01", { id: "vendor-old" }), "/manager/vendor-mgmt/vendors/vendor-old");
    assert.equal(legacyVendorMgmtRedirect("02", { vendorId: "vendor-new" }), "/manager/vendor-mgmt/vendors/vendor-new/performance");
  });
});

it("falls back only for an unavailable API and never for HTTP/auth/mutation errors", () => {
  assert.equal(canUseVendorReadDemo(new TypeError("fetch failed")), true);
  assert.equal(canUseVendorReadDemo(new ApiError(404, "not found")), false);
  assert.equal(canUseVendorReadDemo(new ApiError(403, "forbidden")), false);
  const source = readFileSync(join(process.cwd(), "src/lib/vendor-mgmt-api.ts"), "utf8");
  assert.doesNotMatch(source, /createVendorProfile|updateVendorProfile|SaveVendorProfileInput/);
});
```

Read the assignment/completion page sources and assert that the old literal vendor array, `여러 업체에 견적 요청`, ticket-wide `approve-completion`, and fake repair fallback are absent. Assert the manager nav child points to `/manager/vendor-mgmt/vendors`.

- [ ] **Step 2: Run manager web tests to verify RED**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts src/lib/vendor-mgmt-api.spec.ts src/lib/manager-navigation.spec.ts`

Expected: FAIL because semantic path helpers/pages/actions do not exist and the current API/page still contains direct create/edit and hard-coded vendors.

- [ ] **Step 3: Implement semantic navigation and split reads from mutations**

```ts
export const MANAGER_VENDOR_MGMT_PATHS = {
  vendors: "/manager/vendor-mgmt/vendors",
  search: "/manager/vendor-mgmt/search",
  credit: "/manager/vendor-mgmt/credit",
  vendor: (vendorId: string) => `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}`,
  performance: (vendorId: string) => `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/performance`
} as const;

export function legacyVendorMgmtRedirect(screen: "00" | "01" | "02" | "03", query: { id?: string; vendorId?: string }) {
  const vendorId = query.vendorId ?? query.id;
  if (screen === "01" && vendorId) return MANAGER_VENDOR_MGMT_PATHS.vendor(vendorId);
  if (screen === "02" && vendorId) return MANAGER_VENDOR_MGMT_PATHS.performance(vendorId);
  return screen === "03" ? MANAGER_VENDOR_MGMT_PATHS.search : MANAGER_VENDOR_MGMT_PATHS.vendors;
}
```

Replace legacy `VendorProfile` imports with Task 1 types. Reads may return an explicit envelope:

```ts
export type VendorReadResult<T> = { data: T; source: "API" | "DEMO" };
export function canUseVendorReadDemo(error: unknown) {
  return error instanceof TypeError; // fetch/connectivity only; ApiError is always surfaced
}
async function readWithDemo<T>(path: string, demo: T): Promise<VendorReadResult<T>> {
  try { return { data: await serverFetch<T>(path), source: "API" }; }
  catch (error) { if (canUseVendorReadDemo(error)) return { data: demo, source: "DEMO" }; throw error; }
}
```

Provide `listManagerVendors`, `searchVendorCatalog`, `getManagerVendorDetail`, and `getManagerVendorPerformance` reads. Provide `registerManagerVendor`, `archiveManagerVendor`, `updateManagerVendorNote`, `assignManagerVendor`, `reviewVendorEstimate`, `confirmEstimateVisit`, and `decideRepairCompletion` as direct `serverFetch` mutations with no catch/fallback.

- [ ] **Step 4: Build server actions and canonical pages**

```ts
// manager/vendor-mgmt/actions.ts
"use server";
export async function registerVendorAction(formData: FormData) {
  const vendorId = requiredFormString(formData, "vendorId");
  await registerManagerVendor(vendorId);
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.vendors);
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.search);
}
export async function archiveVendorAction(formData: FormData) {
  const vendorId = requiredFormString(formData, "vendorId");
  await archiveManagerVendor(vendorId);
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.vendor(vendorId));
}
```

The new layout renders inner tabs exactly `내 업체 | 업체 찾기 | 크레딧·결제`; it relies on the existing outer manager shell. The list/detail/performance/search pages render API data, an explicit `데모 데이터` badge when `source=DEMO`, account/verification/active status, numeric performance without AI prose, manager note, register/archive controls, and empty/error states.

Numeric pages call `redirect(legacyVendorMgmtRedirect(...))`; pages 01/02 accept both current `?id=` and approved `?vendorId=`. Delete all direct company creation/edit forms and duplicate-candidate UI.

Replace ticket dash 04's literal vendors with registered candidate rows and a server-action form posting `{ ticketId, vendorId, requestNote }`. Disable the submit button with a concrete reason for non-verified/inactive/unlinked candidates. Render assigned repair's structured estimate and whole-estimate approve/revision/reject actions—never a partial line-item approval. Dash 05 selects one `repairId`, renders its latest completion report, and posts `APPROVED` or `REJECTED` with mandatory rejection note; it never calls a ticket-wide completion endpoint. Change `ticket-manager-api.ts` to return `null`/empty state for a real 404 rather than manufacturing a repair.

- [ ] **Step 5: Run manager web tests to verify GREEN**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts src/lib/vendor-mgmt-api.spec.ts src/lib/manager-navigation.spec.ts && pnpm --filter web test:unit`

Expected: semantic route/redirect, fallback classification, mutation, manager nav, assignment, and individual completion tests pass; the full web unit suite exits `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vendor-mgmt-nav.ts apps/web/src/lib/vendor-mgmt-api.ts apps/web/src/lib/demo-vendor-mgmt.ts apps/web/src/lib/manager-navigation.ts apps/web/src/lib/manager-navigation.spec.ts apps/web/src/app/manager/vendor-mgmt apps/web/src/app/manager/ticket/dash/04 apps/web/src/app/manager/ticket/dash/05 apps/web/src/lib/ticket-manager-api.ts apps/web/src/lib/vendor-mgmt-api.spec.ts
git commit -m "feat: connect manager vendor workspace"
```

### Task 9: Connect Vendor Job Screens and Add Settlements

**Files:**
- Modify: `apps/web/src/lib/vendor-api.ts:1-131`
- Modify: `apps/web/src/lib/server-api.ts:19-41`
- Modify: `apps/web/src/lib/vendor-nav.ts:1-24`
- Create: `apps/web/src/lib/vendor-workflow-view.ts`
- Create: `apps/web/src/app/vendor/_components/vendor-workspace-shell.tsx`
- Create: `apps/web/src/app/vendor/job/actions.ts`
- Create: `apps/web/src/app/vendor/job/estimate-form.tsx`
- Create: `apps/web/src/app/vendor/job/completion-form.tsx`
- Modify: `apps/web/src/app/vendor/job/layout.tsx:1-18`
- Modify: `apps/web/src/app/vendor/job/_components.tsx:1-269`
- Modify: `apps/web/src/app/vendor/job/00/page.tsx`
- Modify: `apps/web/src/app/vendor/job/01/page.tsx`
- Modify: `apps/web/src/app/vendor/job/02/page.tsx`
- Modify: `apps/web/src/app/vendor/job/03/page.tsx`
- Modify: `apps/web/src/app/vendor/job/04/page.tsx`
- Modify: `apps/web/src/app/vendor/job/05/page.tsx`
- Modify: `apps/web/src/app/vendor/job/06/page.tsx`
- Create: `apps/web/src/app/vendor/settlements/layout.tsx`
- Create: `apps/web/src/app/vendor/settlements/page.tsx`
- Test: `apps/web/src/app/vendor/vendor-workflow.spec.ts`
- Test: `apps/web/src/lib/vendor-workflow-view.spec.ts`

**Interfaces:**
- Consumes: Task 1 job/estimate/completion/settlement DTOs and Task 7 vendor endpoints
- Produces: explicit `VendorApiReadResult<T>`, mutation functions/server actions, `VendorWorkspaceShell`, real `/vendor/job/00~06` behavior, `/vendor/settlements`, pure status-to-view mapping

- [ ] **Step 1: Write failing no-fake-job, state mapping, and action tests**

```ts
it("distinguishes API outage demo from a real empty assignment", async () => {
  assert.equal(canUseVendorDemoFallback(new TypeError("fetch failed")), true);
  assert.equal(canUseVendorDemoFallback(new ApiError(404, "작업 없음")), false);
  assert.deepEqual(jobListView({ data: [], source: "API" }), { kind: "EMPTY", message: "배정된 작업이 없습니다." });
  assert.equal(jobListView({ data: DEMO_VENDOR_JOBS, source: "DEMO" }).kind, "DEMO");
});

it("maps workflow states to one legal next action", () => {
  assert.equal(nextVendorJobAction(job({ status: "REQUESTED" })).kind, "WRITE_ESTIMATE");
  assert.equal(nextVendorJobAction(job({ estimateStatus: "REVISION_REQUESTED" })).kind, "REVISE_ESTIMATE");
  assert.equal(nextVendorJobAction(job({ estimateStatus: "APPROVED", status: "ESTIMATE_APPROVED" })).kind, "SCHEDULE");
  assert.equal(nextVendorJobAction(job({ status: "IN_PROGRESS" })).kind, "REPORT_COMPLETION");
  assert.equal(nextVendorJobAction(job({ paymentStatus: "WAITING_COMPLETION" })).kind, "WAIT_MANAGER");
});
```

Source assertions must reject `getVendorAnalysis`, responsibility reasoning, `VENDOR_DEMO_REPAIR` fallback from a successful empty/404 API response, the inert `ContactThread`, a user-editable final amount, and inert `Button`/`LinkButton` submission controls.

- [ ] **Step 2: Run vendor web tests to verify RED**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/vendor/vendor-workflow.spec.ts src/lib/vendor-workflow-view.spec.ts`

Expected: FAIL because the API returns a fake repair/analysis, view helpers and settlements route do not exist, and current controls do not mutate.

- [ ] **Step 3: Replace the legacy repair/AI mapper with workflow DTO reads and strict mutations**

```ts
export type VendorApiReadResult<T> = { data: T; source: "API" | "DEMO" };
export function canUseVendorDemoFallback(error: unknown) { return error instanceof TypeError; }

export async function listVendorJobs(): Promise<VendorApiReadResult<VendorJobSummary[]>> {
  try { return { data: await serverFetch<VendorJobSummary[]>("/vendor/jobs"), source: "API" }; }
  catch (error) { if (canUseVendorDemoFallback(error)) return { data: DEMO_VENDOR_JOBS, source: "DEMO" }; throw error; }
}
export async function getVendorJob(repairId: string) {
  return serverFetch<VendorJobDetail>(`/vendor/jobs/${encodeURIComponent(repairId)}`); // 404 remains 404
}
export const saveEstimateDraft = (repairId: string, input: VendorEstimateDraftInput, estimateId?: string) =>
  serverFetch<VendorEstimate>(estimateId
    ? `/vendor/jobs/${encodeURIComponent(repairId)}/estimate-draft/${encodeURIComponent(estimateId)}`
    : `/vendor/jobs/${encodeURIComponent(repairId)}/estimate-draft`,
  { method: "PUT", body: JSON.stringify(input) });
```

Add `serverFormDataFetch<T>(path, formData)` beside `serverFetch`: it forwards the httpOnly bearer token but deliberately omits `Content-Type` so `fetch` supplies the multipart boundary. `uploadVendorCompletionAttachment` uses only that helper and the dedicated job-scoped endpoint.

Add strict functions for submit/withdraw estimate, schedule/start job, multipart `uploadVendorCompletionAttachment(repairId, file)` to the dedicated endpoint, submit completion, and list settlements. None catch errors. Delete `getVendorAnalysis`, `getVendorTicket`, `getVendorRepair`, and old `RepairJob`/`TeamRepair` mapping from this client. `VendorJobDetail` contains only approved public location, issue description, attachment IDs, manager request, schedule and workflow state—not AI responsibility reasoning, internal manager/contact/account metadata, or other vendors' estimates.

- [ ] **Step 4: Implement real forms, visible states, and the shared mobile shell**

`VendorWorkspaceShell` wraps the existing `PhoneFrame`, retains `requireUser("VENDOR")`, and renders `작업 | 정산` tabs. Both `job/layout.tsx` and `settlements/layout.tsx` use it without nesting a second phone frame.

Implement server actions without optimistic success:

```ts
"use server";
export async function submitCompletionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await submitVendorCompletion(requiredFormString(formData, "repairId"), {
      workSummary: requiredFormString(formData, "workSummary"),
      completedAt: requiredFormString(formData, "completedAt"),
      attachmentIds: formData.getAll("attachmentId").map(String),
      submissionKey: requiredFormString(formData, "submissionKey")
    });
    revalidatePath("/vendor/job/06");
    revalidatePath("/vendor/settlements");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: userSafeApiMessage(error) };
  }
}
```

The estimate form uses a discriminated response selector:

- `FIXED_ESTIMATE`: repeatable category/description/quantity/unit amount rows, client preview only; server response total is authoritative.
- `VISIT_REQUIRED`: visit date plus reason, no amount rows.
- `DECLINED`: mandatory reason, no amount rows.

It has separate `임시 저장` and `제출` actions. Revision creates/edits the next draft version; approved rows are read-only. Page 04 schedules an approved fixed job or displays a manager-confirmed visit; page 05 starts work and links changed-cost work back to a new estimate version before completion; page 06 generates and retains one `submissionKey` per form instance, submits attachment IDs, displays the approved amount read-only, and never accepts a final amount.

The completion form uploads selected files first, stores only returned attachment IDs in form state, and refuses submission while an upload failed or is in flight. Page 00 renders all API jobs or a truthful empty state. A connectivity fallback renders the demo rows with a persistent `데모 데이터` badge; normal `[]`, 401/403 and 404 never fall back. Page 03 renders review notes and legal actions; settlements groups `WAITING_COMPLETION/PENDING_APPROVAL/INSUFFICIENT_CREDIT` as waiting/attention and paid/final statuses separately, without exposing manager balance or policy limit.

- [ ] **Step 5: Run vendor web tests to verify GREEN**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/vendor/vendor-workflow.spec.ts src/lib/vendor-workflow-view.spec.ts && pnpm --filter web test:unit`

Expected: fallback/empty distinction, next-action state mapping, structured form, no editable final amount, settlements, and no-AI projection tests pass; the full web unit suite exits `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vendor-api.ts apps/web/src/lib/server-api.ts apps/web/src/lib/vendor-nav.ts apps/web/src/lib/vendor-workflow-view.ts apps/web/src/lib/vendor-workflow-view.spec.ts apps/web/src/app/vendor
git commit -m "feat: connect vendor jobs and settlements"
```

### Task 10: Seed the Demo Slice, Prove the End-to-End Boundary, and Run Full Verification

**Files:**
- Create: `apps/api/src/roomlog/vendor-workflow.demo-seed.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.ts`
- Test: `apps/api/src/roomlog/vendor-workflow.demo-seed.spec.ts`
- Test: `apps/api/src/roomlog/vendor-workflow.integration.spec.ts`
- Test: `apps/web/src/app/vendor/vendor-workflow-integration.spec.ts`

**Interfaces:**
- Consumes: foundation demo catalog/account rows, Tasks 2–9 complete slice, `ROOMLOG_SEED_DEMO`, Task 6 deferred credit port
- Produces: idempotent direct-Prisma workflow demo seed, full manager→vendor→manager test, regression guards, independently GREEN workflow handoff with `WAITING_COMPLETION`

- [ ] **Step 1: Write failing idempotent seed and full-boundary tests**

```ts
it("seeds one registered 120,000원 workflow without duplicate history", async () => {
  await seeder.seed();
  await seeder.seed();
  assert.equal(await prisma.managerVendor.count({ where: { managerId: "landlord-demo", vendorId: "vendor-demo" } }), 1);
  assert.equal(await prisma.vendorEstimate.count({ where: { repairId: "repair-demo-credit", status: "APPROVED" } }), 1);
  assert.equal((await prisma.vendorEstimate.findFirstOrThrow({ where: { repairId: "repair-demo-credit", status: "APPROVED" } })).totalAmount, 120000);
});

it("runs register, assign, estimate, completion, decision, outbox and deferred settlement exactly once", async () => {
  await manager.register("manager-a", "vendor-1");
  const job = await manager.assign("manager-a", "ticket-1", "vendor-1", "누수 수리");
  const draft = await vendor.saveDraft("vendor-user-1", job.repairId, fixed120000);
  await vendor.submitEstimate("vendor-user-1", job.repairId, draft.id);
  await manager.approveEstimate("manager-a", job.repairId, draft.id, "LANDLORD");
  await vendor.schedule("vendor-user-1", job.repairId, visitAt);
  await vendor.start("vendor-user-1", job.repairId);
  const completion = await vendor.complete("vendor-user-1", job.repairId, completionWithKey("golden-key"));
  const retry = await vendor.complete("vendor-user-1", job.repairId, completionWithKey("golden-key"));
  assert.equal(retry.report.id, completion.report.id);
  const decision = await manager.decide("manager-a", job.repairId, { decision: "APPROVED" });
  assert.equal((await prisma.vendorPaymentRequest.findUniqueOrThrow({ where: { repairId: job.repairId } })).status, "WAITING_COMPLETION");
  const event = await prisma.domainEventOutbox.findUniqueOrThrow({
    where: { eventKey: `vendor-completion-approved:${decision.decision.id}` }, include: { deliveries: true }
  });
  assert.deepEqual(event.deliveries.map((row) => [row.consumer, row.state]).sort(), [
    ["CREDIT_EVALUATION", "PENDING"], ["NOTIFICATION", "PENDING"]
  ]);
});
```

Also assert manager B/vendor B cannot observe or mutate the job, the other repair on the ticket is untouched, no `Cost`/ledger/payment attempt is created by workflow, a deferred worker tick does not claim or churn `CREDIT_EVALUATION`, restarting with the same deferred provider preserves the pending backlog, and tenant/public projections contain none of `managerNote`, `accountLinkId`, phone, or payment policy.

- [ ] **Step 2: Run focused integration tests to verify RED**

Run: `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-workflow.demo-seed.spec.ts src/roomlog/vendor-workflow.integration.spec.ts && pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/vendor/vendor-workflow-integration.spec.ts`

Expected: FAIL because the direct-Prisma demo seeder and complete cross-surface regression test do not exist.

- [ ] **Step 3: Add an opt-in idempotent direct-Prisma demo seed**

Create an `OnModuleInit` seeder that exits unless `ROOMLOG_SEED_DEMO=true`. It must first require the foundation demo catalog/account rows, then use one transaction and stable IDs to upsert:

```ts
await tx.managerVendor.upsert({
  where: { managerId_vendorId: { managerId: "landlord-demo", vendorId: "vendor-demo" } },
  create: { id: "mvd-demo", managerId: "landlord-demo", vendorId: "vendor-demo", status: "ACTIVE" },
  update: { status: "ACTIVE" }
});
await upsertDemoRepairAndApprovedEstimate(tx, {
  repairId: "repair-demo-credit",
  estimateId: "estimate-demo-credit-v1",
  lineItemId: "estimate-line-demo-credit-v1",
  amount: 120000,
  costBearer: "LANDLORD"
});
```

Do not seed credit balances/ledger/top-ups here. Do not call `RoomlogStore` or the asynchronous projector. A second seed call must not change IDs, versions, or add outbox/payment rows. Register the seeder in `RoomlogModule` without making production startup dependent on demo data.

- [ ] **Step 4: Add regression guards and make the full boundary GREEN**

Complete the integration fixtures with real test-DB users/room/ticket/catalog/account-link rows and the deferred boundary. Add source guards:

```bash
rg -n 'manual:|createManagerVendorProfile|updateManagerVendorProfile' apps/api/src apps/web/src
rg -n 'VENDOR_DEMO_REPAIR|getVendorAnalysis|responsibilityHint' apps/web/src/lib/vendor-api.ts apps/web/src/app/vendor/job
rg -n '#[0-9A-Fa-f]{6}' apps/web/src/app/manager/vendor-mgmt apps/web/src/app/vendor apps/web/src/lib/vendor-mgmt-api.ts apps/web/src/lib/vendor-api.ts
```

Expected: all three commands return no matches in production paths. Test fixtures may contain explanatory forbidden-string assertions, so scope the final automated source scan to production files or exclude `*.spec.ts`.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm run db:generate
ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test pnpm test:api
pnpm test:web
git diff --check
bash scripts/verify.sh
```

Expected: every command exits `0`; DB-backed workflow tests run rather than skip; `git diff --check` prints nothing; `verify.sh` reports successful types, UI, web, API builds and API smoke. The workflow handoff remains `WAITING_COMPLETION` with a durable pending `CREDIT_EVALUATION` delivery until the separate credit plan replaces the boundary provider.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/roomlog/vendor-workflow.demo-seed.ts apps/api/src/roomlog/roomlog.module.ts apps/api/src/roomlog/vendor-workflow.demo-seed.spec.ts apps/api/src/roomlog/vendor-workflow.integration.spec.ts apps/web/src/app/vendor/vendor-workflow-integration.spec.ts
git commit -m "test: verify vendor workflow slice"
```

## Execution Handoff

Plan complete. Implement Tasks 1–10 in order with `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Do not start Task 1 until both foundation migrations and `VendorAccountResolver.resolveActiveVendorId` are present; the credit plan may start only after Task 6 has established `VendorPaymentRequest`, the shared `DomainEventsModule`, and `VendorCompletionCreditBoundary`.
