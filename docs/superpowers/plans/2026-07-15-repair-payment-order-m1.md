# Repair Payment Order M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자와 세입자가 같은 서버 명령을 통해 테스트 Toss 일회성 수리비 결제 주문을 만들고, 승인·재조회·취소·재결제를 안전하게 처리할 수 있는 공통 기반을 완성한다.

**Architecture:** 기존 `VendorPaymentRequest`는 승인된 견적과 완료 확인을 근거로 한 지급 의무로 유지하고, 새 `RepairPaymentOrder`를 Toss 결제 시도 단위로 1:N 연결한다. 역할별 controller는 서로 다른 URL과 인증 경계를 제공하지만 하나의 `RepairPaymentOrderService`와 하나의 Prisma repository를 사용한다. repository가 지급 요청·주문 행 잠금, 소유권, 금액, 멱등성, 상태 전이를 강제하고 service는 기존 `TossPaymentGateway`만 조정한다.

**Tech Stack:** TypeScript 5.9, pnpm monorepo, NestJS 11, Prisma 7, PostgreSQL 18, Toss Payments test API, Node test runner, Docker Compose

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-15-repair-payment-milestones-design.md`다. 구현 판단이 설계와 충돌하면 코드를 확장하지 말고 설계부터 다시 확인한다.
- 이 문서는 M1만 실행한다. 관리자 결제 UI는 M2, 세입자 견적·완료 연결은 M3, 세입자 결제 UI는 M4, 복구 UX 통합은 M5다.
- 기존 `DIRECT`/`DIRECT_PAID`는 관리자가 기록한 외부 지급 증거다. Toss 의미로 재사용하거나 이름을 바꾸지 않는다.
- 빌링키, 저장 카드, 자동 카드 결제, 환불, 부분취소, 실제 업체 송금, AI 프롬프트·음성·도구 구현은 추가하지 않는다.
- 공개 HTTP body에서 `initiatedBy`, `payerUserId`, `confirmationId`, `toolCallId`를 신뢰하지 않는다. 현재 controller는 항상 사람 principal과 `USER_UI`를 서버에서 만든다. 향후 AI는 application service를 내부 호출하면서만 `AI_AGENT` 문맥을 전달한다.
- 결제 금액은 request body가 아니라 잠근 `VendorPaymentRequest.amount`만 사용한다. confirm callback의 금액은 저장 금액과 일치하는지 검증할 뿐이다.
- `paymentKey`, 내부 DB `id`, `payerUserId`, AI 감사 식별자는 공개 응답에서 제거한다.
- 새 주문은 `PENDING_APPROVAL` 또는 `INSUFFICIENT_CREDIT` 지급 요청에만 만들 수 있다. `WAITING_COMPLETION`과 모든 최종 지급 상태는 거절한다.
- Toss 결제는 `RepairPaymentOrder` 자체가 시도 원장이다. 기존 `VendorPaymentAttempt` 행을 중복 생성하지 않는다. 다만 `VendorPaymentRequest.lastAttemptMode` 기록을 위해 공유 enum에는 `TOSS`를 추가한다.
- 과거 migration은 수정하지 않는다. 신규 migration은 `prisma/migrations/20260715140000_repair_payment_orders/migration.sql`만 추가한다. PostgreSQL enum 값을 같은 파일의 후속 DDL에서 사용하므로 이 migration에 명시적 `BEGIN`/`COMMIT`을 두지 않는다.
- DB 통합 테스트는 로컬 `roomlog_test`만 사용한다. `scripts/reset-test-db.sh`의 데이터베이스명 가드를 우회하지 않는다.
- 각 Task는 RED 확인 → 최소 구현 → GREEN 확인 → 집중 커밋 순서로 끝낸다.
- 구현 시작 직전에 `origin/dev`를 확인하고 병합한다. 병합 후의 타입·API·web·Docker 결과만 최종 근거로 사용한다.

---

## File Structure

### Create

- `packages/types/src/repair-payment.ts` — 공통 주문·checkout·입력 계약
- `prisma/migrations/20260715140000_repair_payment_orders/migration.sql` — payer 보정, 주문 원장, enum·trigger·constraint
- `apps/api/src/credit/repair-payment-order.repository.ts` — actor와 명령/결과 port
- `apps/api/src/credit/prisma-repair-payment-order.repository.ts` — 잠금·멱등성·상태 전이 구현
- `apps/api/src/credit/repair-payment-order.service.ts` — Toss confirm/reconcile orchestration
- `apps/api/src/credit/repair-payment-order.controller.ts` — 관리자·세입자 역할별 API
- `apps/api/src/credit/repair-payment-order.contract.spec.ts` — 공유 계약 compile/runtime test
- `apps/api/src/credit/repair-payment-order.schema.spec.ts` — migration 구조·보정·제약 test
- `apps/api/src/credit/prisma-repair-payment-order.repository.spec.ts` — DB 동시성·상태 전이 test
- `apps/api/src/credit/repair-payment-order.service.spec.ts` — gateway 결과별 service test
- `apps/api/src/credit/repair-payment-order.controller.spec.ts` — 역할·redaction·route delegation test

### Modify

- `packages/types/src/index.ts`
- `packages/types/src/vendor-workflow.ts`
- `packages/types/src/vendor-credit.ts`
- `prisma/schema.prisma`
- `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- `apps/api/src/roomlog/prisma-manager-vendor.repository.ts`
- `apps/api/src/roomlog/vendor-completion-credit.boundary.ts`
- `apps/api/src/credit/prisma-credit-query.repository.ts`
- `apps/api/src/credit/prisma-credit-command.repository.ts`
- `apps/api/src/credit/credit-command.repository.ts`
- `apps/api/src/credit/credit.controller.ts`
- `apps/api/src/credit/credit.module.ts`
- `apps/api/src/credit/credit-module-wiring.spec.ts`
- `apps/web/src/lib/vendor-workflow-presenter.ts`
- `apps/web/src/lib/vendor-workflow-ui.spec.ts`
- `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx`
- `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- 기존 `vendorPaymentRequest.create` fixture가 있는 API spec 파일들

---

### Task 1: Sync dev and freeze the baseline

**Files:**
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-07-15-repair-payment-milestones-design.md`
- Read: files in the structure map above

**Interfaces:**
- Consumes: current M1 design/plan commits and latest `origin/dev`
- Produces: clean, reproducible implementation base with no hidden pre-existing failure

- [ ] **Step 1: Confirm the worktree and current branch**

```bash
pwd
git status --short --branch
git branch --show-current
git log --oneline --decorate -8
```

Expected: work happens in `.worktrees/vendor-credit-design` on `yong/vendor-credit-core`; only the approved design and plan are ahead of the pushed implementation checkpoint.

- [ ] **Step 2: Fetch and compare the latest dev before any code change**

```bash
git fetch origin dev
git rev-list --left-right --count HEAD...origin/dev
git log --oneline --left-right HEAD...origin/dev
```

Expected: if the right-side count is nonzero, merge before continuing.

- [ ] **Step 3: Merge current dev when required**

```bash
git merge --no-edit origin/dev
```

Expected: retain `origin/dev` UI changes and reapply only this branch's vendor/credit logic if a conflict occurs. Do not resolve by deleting another contributor's work.

- [ ] **Step 4: Record the pre-change gates**

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api build
pnpm --filter web test
```

Expected: all pass. Any pre-existing failure is recorded with its exact command and is not silently attributed to M1.

---

### Task 2: Add the shared repair-payment contract

**Files:**
- Create: `packages/types/src/repair-payment.ts`
- Create: `apps/api/src/credit/repair-payment-order.contract.spec.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/vendor-workflow.ts`
- Modify: `packages/types/src/vendor-credit.ts`
- Modify: `apps/api/src/roomlog/vendor-completion-credit.boundary.ts`
- Modify: `apps/api/src/credit/credit-command.repository.ts`
- Modify: `apps/api/src/roomlog/vendor-workflow.contract.spec.ts`

**Interfaces:**
- Produces: one shared status vocabulary and explicit internal/public order views
- Preserves: old external-payment and credit-settlement contracts

- [ ] **Step 1: Write the failing contract test**

The test must compile and assert these exact public properties:

```ts
const checkout: RepairPaymentCheckout = {
  order: {
    orderId: "repair-order-public-1",
    paymentRequestId: "payment-request-1",
    payerRole: "MANAGER",
    flow: "TOSS_ONE_TIME",
    amount: 120_000,
    status: "READY",
    returnPath: "/manager/vendor-mgmt/credit",
    initiatedBy: "USER_UI",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  },
  clientKey: "test_ck_roomlog_credit",
  customerKey: "repair_opaque_customer",
  orderName: "집우집주 수리비 결제"
};

const createInput: CreateRepairPaymentOrderInput = {
  creationKey: "repair-create-1",
  returnPath: "/manager/vendor-mgmt/credit"
};

const confirmInput: ConfirmRepairPaymentOrderInput = {
  paymentKey: "provider-payment-key",
  amount: 120_000
};
```

Also assert that `VendorPaymentRequestStatus` accepts `TOSS_PAID`, `VendorPaymentAttemptMode` accepts `TOSS`, and the create input has no `amount`, `payerUserId`, or `initiatedBy` property.

- [ ] **Step 2: Run the test and prove RED**

```bash
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.contract.spec.ts
```

Expected: compilation fails because the new exports and enum members do not exist.

- [ ] **Step 3: Implement the shared type file**

Use these exact contract families:

```ts
export type RepairPaymentPayerRole = "MANAGER" | "TENANT";
export type RepairPaymentFlow = "TOSS_ONE_TIME";
export type RepairPaymentInitiator = "USER_UI" | "AI_AGENT" | "SYSTEM_POLICY";
export type RepairPaymentOrderStatus =
  | "READY"
  | "CONFIRMING"
  | "RECONCILIATION_REQUIRED"
  | "APPROVED"
  | "FAILED"
  | "CANCELLED";

export interface RepairPaymentOrderView {
  id: string;
  orderId: string;
  paymentRequestId: string;
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  flow: RepairPaymentFlow;
  amount: number;
  status: RepairPaymentOrderStatus;
  paymentKey?: string;
  method?: string;
  failureReason?: string;
  returnPath: string;
  initiatedBy: RepairPaymentInitiator;
  confirmationId?: string;
  toolCallId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RepairPaymentOrderPublicView = Omit<
  RepairPaymentOrderView,
  "id" | "paymentKey" | "payerUserId" | "confirmationId" | "toolCallId"
>;

export interface CreateRepairPaymentOrderInput {
  creationKey: string;
  returnPath: string;
}

export interface RetryRepairPaymentOrderInput {
  creationKey: string;
  returnPath: string;
}

export interface ConfirmRepairPaymentOrderInput {
  paymentKey: string;
  amount: number;
}
```

`RepairPaymentCheckout` contains `order`, `clientKey`, opaque `customerKey`, and fixed `orderName`. Export the file from `packages/types/src/index.ts`.

- [ ] **Step 4: Extend the payment-request contract without exposing authority IDs**

Add `payerRole` and `payerUserId` to internal `VendorPaymentRequest` and `ManagerVendorPaymentRequestView`. Add only `payerRole` to public manager view. Add `TOSS_PAID` and `TOSS` to the existing unions. Extend final-state unions in `VendorCompletionCreditBoundary` and `CreditCommandRepository` with `TOSS_PAID`.

- [ ] **Step 5: Run contract and type gates**

```bash
cd ../../
pnpm --filter @roomlog/types typecheck
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.contract.spec.ts src/roomlog/vendor-workflow.contract.spec.ts
```

Expected: both tests pass; exhaustive `Record<VendorPaymentRequestStatus, string>` consumers now identify every required compatibility edit.

- [ ] **Step 6: Commit the contract**

```bash
git add packages/types/src apps/api/src/credit/repair-payment-order.contract.spec.ts apps/api/src/credit/credit-command.repository.ts apps/api/src/roomlog/vendor-completion-credit.boundary.ts apps/api/src/roomlog/vendor-workflow.contract.spec.ts
git commit -m "feat(payment): define repair order contract"
```

---

### Task 3: Add payer authority and the repair-payment order schema

**Files:**
- Create: `prisma/migrations/20260715140000_repair_payment_orders/migration.sql`
- Create: `apps/api/src/credit/repair-payment-order.schema.spec.ts`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: immutable payer authority on each payment request and one-open-order DB invariant
- Backfills: every existing request as `MANAGER` with `payerUserId=managerId`

- [ ] **Step 1: Write the failing schema test**

The test must check:

- `VendorPaymentPayerRole`, `RepairPaymentFlow`, `RepairPaymentInitiator`, `RepairPaymentOrderStatus` enum values.
- `VendorPaymentRequest.payerRole` and non-null `payerUserId`.
- `RepairPaymentOrder` table, unique `orderId`, `creationKey`, `paymentKey`, `openOrderKey`.
- `RepairPaymentOrder_amount_positive`, `RepairPaymentOrder_open_key_shape`, `RepairPaymentOrder_state_shape` checks.
- restrictive FKs to `VendorPaymentRequest` and `UserAccount`.
- payer consistency and immutable identity triggers.
- every migrated pre-existing request satisfies `payerRole='MANAGER' AND payerUserId=managerId`.

- [ ] **Step 2: Prove RED against the current database**

```bash
docker compose up -d postgres
export ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public'
bash scripts/reset-test-db.sh
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.schema.spec.ts
```

Expected: the new table or enum assertion fails.

- [ ] **Step 3: Add the Prisma enums and relations**

The core model shape is:

```prisma
model RepairPaymentOrder {
  id              String                   @id
  paymentRequestId String
  payerRole       VendorPaymentPayerRole
  payerUserId     String
  orderId         String                   @unique
  creationKey     String                   @unique
  payloadHash     String
  openOrderKey    String?                  @unique
  flow            RepairPaymentFlow        @default(TOSS_ONE_TIME)
  amount          Int
  status          RepairPaymentOrderStatus @default(READY)
  paymentKey      String?                  @unique
  method          String?
  failureReason   String?
  returnPath      String
  initiatedBy     RepairPaymentInitiator
  confirmationId  String?
  toolCallId       String?
  approvedAt      DateTime?
  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt
  paymentRequest  VendorPaymentRequest     @relation(fields: [paymentRequestId], references: [id], onDelete: Restrict)
  payer            UserAccount             @relation("RepairPaymentOrderPayer", fields: [payerUserId], references: [id], onDelete: Restrict)

  @@index([paymentRequestId, status, updatedAt])
  @@index([payerRole, payerUserId, status, updatedAt])
}
```

Add the reverse relations to `UserAccount` and `VendorPaymentRequest`. Make `VendorPaymentRequest.payerRole` and `payerUserId` required in Prisma after migration backfill.

- [ ] **Step 4: Write the forward-only migration**

Apply operations in this order:

1. Add enum values `TOSS_PAID`, `TOSS`, and audit type `TOSS_PAID`.
2. Create the four new order/payer enums.
3. Add nullable payer columns, backfill from `managerId`, then set non-null and add FK/index.
4. Create `RepairPaymentOrder`, indexes, FKs, and checks.
5. Add a payer-consistency trigger: `MANAGER` requires `payerUserId=managerId`; `TENANT` requires `payerUserId=Ticket.tenantId` through `RepairRequest.ticketId`.
6. Replace `protect_vendor_payment_request_identity()` so `payerRole` and `payerUserId` cannot change after creation.
7. Keep existing `VendorPaymentAttempt` writes unchanged. New Toss code records attempts only in `RepairPaymentOrder`; it does not insert a duplicate attempt row.

The open-key check must encode this exact invariant:

```sql
CHECK (
  ("status" IN ('READY', 'CONFIRMING', 'RECONCILIATION_REQUIRED') AND "openOrderKey" = "paymentRequestId")
  OR
  ("status" IN ('APPROVED', 'FAILED', 'CANCELLED') AND "openOrderKey" IS NULL)
)
```

`FAILED` may retain a `paymentKey`. `CANCELLED` may retain failure evidence when a failed order is cleaned up. Neither state may retain `openOrderKey`.

- [ ] **Step 5: Regenerate Prisma and run the migration test GREEN**

```bash
cd ../../
pnpm run db:generate
export ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public'
bash scripts/reset-test-db.sh
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.schema.spec.ts src/credit/vendor-credit.schema.spec.ts
```

Expected: both schema suites pass and the test reset applies all migrations from the frozen baseline.

- [ ] **Step 6: Commit the schema**

```bash
git add prisma/schema.prisma prisma/migrations/20260715140000_repair_payment_orders apps/api/src/credit/repair-payment-order.schema.spec.ts
git commit -m "feat(payment): persist repair payment orders"
```

---

### Task 4: Wire payer data through existing payment-request producers

**Files:**
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-manager-vendor.repository.ts`
- Modify: `apps/api/src/credit/prisma-credit-query.repository.ts`
- Modify: `apps/api/src/credit/credit.controller.ts`
- Modify: every API spec fixture that directly creates a `VendorPaymentRequest`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.completion.spec.ts`

**Interfaces:**
- Produces: all current landlord-owned requests with explicit manager payer authority
- Preserves: manager workspace and vendor job responses without leaking payer IDs

- [ ] **Step 1: Add failing producer assertions**

In the completion repository test, assert a newly created landlord request has:

```ts
assert.equal(result.paymentRequest?.payerRole, "MANAGER");
assert.equal(result.paymentRequest?.payerUserId, fixture.managerId);
```

In the controller public-response test, assert `payerRole` remains but `payerUserId` is absent.

- [ ] **Step 2: Run focused tests RED**

```bash
cd apps/api
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm test
```

Expected: type errors or payer assertions fail until producers and mappers are updated.

- [ ] **Step 3: Update the live producer and mappers**

When `PrismaVendorWorkflowRepository` creates a landlord payment request, write:

```ts
payerRole: "MANAGER",
payerUserId: managerId
```

Map both fields into internal shared views in workflow, manager-vendor, and credit query repositories. `CreditController.publicPaymentRequest()` returns `payerRole` but never `payerUserId`.

- [ ] **Step 4: Repair direct-create fixtures explicitly**

Add payer fields to these known fixture owners rather than weakening the production schema:

- `apps/api/src/credit/prisma-credit-settlement.spec.ts`
- `apps/api/src/roomlog/financial-cost-boundary.spec.ts`
- `apps/api/src/roomlog/prisma-manager-vendor.repository.spec.ts`
- `apps/api/src/roomlog/prisma-vendor-workflow.estimate.spec.ts`
- `apps/api/src/roomlog/services/roomlog-vendor-workflow.completion.spec.ts`
- `apps/api/src/roomlog/vendor-workflow.contract.spec.ts`

Use `MANAGER` and the fixture's real manager ID. Do not use arbitrary placeholder users because the new FK and payer trigger must remain active in tests.

- [ ] **Step 5: Run the API suite and typecheck GREEN**

```bash
cd ../../
pnpm run db:generate
pnpm --filter @roomlog/types typecheck
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm test:api
```

Expected: existing workflow, credit, financial boundary, and new payer assertions pass.

- [ ] **Step 6: Commit producer wiring**

```bash
git add apps/api/src/roomlog apps/api/src/credit apps/api/src/credit/credit.controller.ts
git commit -m "refactor(payment): record request payer authority"
```

---

### Task 5: Implement atomic order creation and authorization

**Files:**
- Create: `apps/api/src/credit/repair-payment-order.repository.ts`
- Create: `apps/api/src/credit/prisma-repair-payment-order.repository.ts`
- Create: `apps/api/src/credit/prisma-repair-payment-order.repository.spec.ts`

**Interfaces:**
- Consumes: a server-created actor and payment-request ID
- Produces: server-priced READY order or an idempotent replay

- [ ] **Step 1: Define the repository port in the failing DB spec**

Use this actor boundary:

```ts
export interface RepairPaymentActor {
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  initiatedBy: RepairPaymentInitiator;
  confirmationId?: string;
  toolCallId?: string;
}
```

The repository exposes `assertTenantAccess`, `createOrder`, `getOrder`, `claimConfirmation`, `finalizeOrder`, `markRejected`, `markUncertain`, `cancelOrder`, and `retryOrder`. Every method receives the actor; no method accepts a free-standing manager ID or tenant ID.

- [ ] **Step 2: Write failing creation/authorization tests**

Cover these cases:

- manager can create only their `MANAGER` request.
- tenant can create only their `TENANT` request.
- manager cannot read tenant order; tenant cannot read manager order; a second user of the same role cannot read either.
- inactive or non-tenant account fails `assertTenantAccess`.
- request in `WAITING_COMPLETION` or final status cannot create an order.
- order amount always equals `VendorPaymentRequest.amount` because create command has no amount.
- same creation key and same canonical payload returns the same order.
- same creation key with a changed request, actor, return path, or audit context throws conflict.
- two concurrent distinct creation keys for one request leave exactly one READY row and one `openOrderKey`.
- `returnPath` accepts a single-leading-slash app path and rejects absolute URLs, `//` paths, backslashes, and blank strings.

- [ ] **Step 3: Prove RED**

```bash
cd apps/api
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/prisma-repair-payment-order.repository.spec.ts
```

Expected: missing repository module or unimplemented operations fail.

- [ ] **Step 4: Implement canonical hashing and mapping**

The payload hash includes, in stable key order:

```text
paymentRequestId, payerRole, payerUserId, amount, returnPath,
initiatedBy, confirmationId-or-empty, toolCallId-or-empty
```

Use SHA-256 hex. `mapRepairPaymentOrder` converts dates to ISO and verifies `amount` is a safe positive integer.

- [ ] **Step 5: Implement creation under a payment-request lock**

Use a short Prisma transaction with serializable retry:

1. `SELECT ... FOR UPDATE` the payment request and join its repair/ticket authority.
2. Verify payer role/user and payable request state.
3. Check `creationKey`; return identical hash replay, reject a different hash.
4. Reject an existing active order created under another key.
5. Insert READY with copied amount and `openOrderKey=paymentRequestId`.

Translate PostgreSQL serialization and unique races into a bounded retry, then return the persisted winner or a deterministic conflict. Never catch and relabel unrelated database errors as idempotent success.

- [ ] **Step 6: Run DB tests GREEN**

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/prisma-repair-payment-order.repository.spec.ts
```

Expected: authorization, server-price, replay, collision, and concurrent creation tests pass.

- [ ] **Step 7: Commit creation logic**

```bash
cd ../../
git add apps/api/src/credit/repair-payment-order.repository.ts apps/api/src/credit/prisma-repair-payment-order.repository.ts apps/api/src/credit/prisma-repair-payment-order.repository.spec.ts
git commit -m "feat(payment): create repair orders atomically"
```

---

### Task 6: Implement the order state machine and payment finalization

**Files:**
- Modify: `apps/api/src/credit/repair-payment-order.repository.ts`
- Modify: `apps/api/src/credit/prisma-repair-payment-order.repository.ts`
- Modify: `apps/api/src/credit/prisma-repair-payment-order.repository.spec.ts`
- Modify: `apps/api/src/credit/prisma-credit-command.repository.ts`

**Interfaces:**
- Consumes: provider snapshot only after a claimed order
- Produces: one paid request, one Cost row, one audit event, one domain event

- [ ] **Step 1: Add failing claim tests**

Prove two concurrent confirms with the same order/payment key return one `CLAIMED` and one `IN_PROGRESS`, leaving one CONFIRMING row. A mismatched amount or an already-used payment key must fail before any provider call.

The claim result union is:

```ts
type RepairPaymentConfirmationClaim =
  | { outcome: "CLAIMED"; order: RepairPaymentOrderView }
  | { outcome: "ALREADY_APPROVED"; order: RepairPaymentOrderView }
  | { outcome: "IN_PROGRESS"; order: RepairPaymentOrderView }
  | { outcome: "RECONCILIATION_REQUIRED"; order: RepairPaymentOrderView };
```

- [ ] **Step 2: Add failing finalization tests**

For a matching `DONE` snapshot, assert one transaction:

- changes order to `APPROVED`, stores method/approved time, clears `openOrderKey`.
- changes request to `TOSS_PAID`, `lastAttemptMode=TOSS`, sets deterministic `costId`, clears old failure reason, sets `processedAt`.
- creates one confirmed `Cost` using request.managerId as property context and `paymentRef=orderId`.
- creates one `VendorPaymentAuditEvent(TOSS_PAID)` with actor user.
- enqueues one `VENDOR_PAYMENT_PAID` event with `statusCode=TOSS_PAID` for active vendor users.
- creates no `CreditLedgerEntry` and no `VendorPaymentAttempt`.
- replay returns the same approved order without duplicate Cost, audit, or event.

- [ ] **Step 3: Add failing failure/recovery tests**

Cover exact transitions:

- CONFIRMING → FAILED on explicit provider decline; clear `openOrderKey` and retain bounded reason.
- CONFIRMING/RECONCILIATION_REQUIRED → RECONCILIATION_REQUIRED on uncertain result; keep `openOrderKey` and payment key.
- READY → CANCELLED; FAILED → CANCELLED while retaining failure evidence.
- READY retry atomically cancels old order and creates one new READY order with a new creation key.
- FAILED retry creates one new READY order.
- CONFIRMING, RECONCILIATION_REQUIRED, APPROVED, and CANCELLED reject retry.
- a concurrent retry/create race leaves one active order.

- [ ] **Step 4: Prove RED for the new state tests**

```bash
cd apps/api
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/prisma-repair-payment-order.repository.spec.ts
```

Expected: new transition assertions fail before implementation.

- [ ] **Step 5: Implement guarded transitions**

Every transition locks both order and payment request. Terminal transitions set `openOrderKey=null`. Finalization accepts only matching order ID, payment key, amount, and `DONE`; it treats an already-approved same order as idempotent and any different final payment as conflict.

Add `TOSS_PAID` to `FINAL_PAYMENT_STATUSES` and `isFinalPaymentStatus()` in the existing credit repository so credit settlement cannot pay the same request after Toss succeeds.

- [ ] **Step 6: Run DB state and credit regression tests GREEN**

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/prisma-repair-payment-order.repository.spec.ts src/credit/prisma-credit-settlement.spec.ts
```

Expected: state-machine tests pass and existing credit/direct settlement remains green.

- [ ] **Step 7: Commit the state machine**

```bash
cd ../../
git add apps/api/src/credit/repair-payment-order.repository.ts apps/api/src/credit/prisma-repair-payment-order.repository.ts apps/api/src/credit/prisma-repair-payment-order.repository.spec.ts apps/api/src/credit/prisma-credit-command.repository.ts
git commit -m "feat(payment): finalize and recover repair orders"
```

---

### Task 7: Orchestrate Toss confirm and reconciliation

**Files:**
- Create: `apps/api/src/credit/repair-payment-order.service.ts`
- Create: `apps/api/src/credit/repair-payment-order.service.spec.ts`
- Reuse: `apps/api/src/payment/toss-payment.gateway.ts`
- Reuse: `apps/api/src/auth/bearer-token.ts`

**Interfaces:**
- Consumes: repository claim plus existing Toss gateway
- Produces: checkout and safe provider outcome transitions

- [ ] **Step 1: Write the failing service harness**

Use fake repository queues and fake `TossPaymentGateway`. Test:

- stable opaque customer key is not equal to payer user ID and differs by payer.
- checkout uses server order amount and fixed `집우집주 수리비 결제` order name.
- duplicate concurrent confirm invokes gateway once because only `CLAIMED` continues.
- `DECLINED` calls `markRejected`.
- timeout/network/unknown calls `markUncertain`.
- matching DONE calls `finalizeOrder`.
- mismatched order ID, payment key, amount, or non-DONE result becomes reconciliation required.
- reconcile maps DONE to finalization, ABORTED/EXPIRED to failure, and nonterminal provider state to reconciliation required.
- failure while persisting uncertain state throws `ServiceUnavailableException` with a safe retry message.
- tenant bearer auth rejects inactive/non-tenant users through repository `assertTenantAccess`.

- [ ] **Step 2: Prove RED**

```bash
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.service.spec.ts
```

Expected: service import or methods fail.

- [ ] **Step 3: Implement service validation and checkout**

Expose application methods:

```ts
createOrder(actor, paymentRequestId, input)
getOrder(actor, orderId)
confirmOrder(actor, orderId, input)
reconcileOrder(actor, orderId)
cancelOrder(actor, orderId)
retryOrder(actor, orderId, input)
requireTenant(authorization)
```

Validate nonblank creation keys, internal return paths, positive callback amount, and payment key. Derive customer key with HMAC over `repair-payment-customer:${payerUserId}` and the existing token secret. Do not include role/user identifiers in `orderName`.

- [ ] **Step 4: Implement provider orchestration**

Call `confirmPayment()` only for `CLAIMED`. For reconciliation call `getPaymentByOrderId()`. Reuse `TossPaymentGatewayError.kind` exactly as the existing credit topup service does; do not add a second HTTP client or embed Toss secrets in this service.

- [ ] **Step 5: Run service and gateway tests GREEN**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.service.spec.ts src/payment/toss-payment.gateway.spec.ts
```

Expected: service behavior and existing gateway parsing remain green.

- [ ] **Step 6: Commit orchestration**

```bash
cd ../../
git add apps/api/src/credit/repair-payment-order.service.ts apps/api/src/credit/repair-payment-order.service.spec.ts
git commit -m "feat(payment): orchestrate Toss repair payments"
```

---

### Task 8: Expose role-prefixed APIs and wire the module

**Files:**
- Create: `apps/api/src/credit/repair-payment-order.controller.ts`
- Create: `apps/api/src/credit/repair-payment-order.controller.spec.ts`
- Modify: `apps/api/src/credit/credit.module.ts`
- Modify: `apps/api/src/credit/credit-module-wiring.spec.ts`

**Interfaces:**
- Produces: 12 role-prefixed endpoints delegating to one service
- Security: manager auth uses existing manager gate; tenant auth uses active TENANT gate

- [ ] **Step 1: Write failing controller tests**

Assert all manager endpoints call `CreditService.requireManager()` and build:

```ts
{
  payerRole: "MANAGER",
  payerUserId: managerId,
  initiatedBy: "USER_UI"
}
```

Assert all tenant endpoints call `RepairPaymentOrderService.requireTenant()` and build the equivalent TENANT actor. Body fields attempting to spoof `payerUserId`, `initiatedBy`, `confirmationId`, or `toolCallId` must be ignored or rejected by validation.

Assert public responses omit `id`, `paymentKey`, `payerUserId`, `confirmationId`, and `toolCallId` for create/get/confirm/reconcile/cancel/retry.

- [ ] **Step 2: Prove RED**

```bash
cd apps/api
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.controller.spec.ts
```

Expected: controller import or route methods fail.

- [ ] **Step 3: Implement the exact route surface**

```text
POST /manager/vendor-payment-requests/:id/toss-orders
GET  /manager/repair-payment-orders/:orderId
POST /manager/repair-payment-orders/:orderId/confirm
POST /manager/repair-payment-orders/:orderId/reconcile
POST /manager/repair-payment-orders/:orderId/cancel
POST /manager/repair-payment-orders/:orderId/retry

POST /tenant/vendor-payment-requests/:id/toss-orders
GET  /tenant/repair-payment-orders/:orderId
POST /tenant/repair-payment-orders/:orderId/confirm
POST /tenant/repair-payment-orders/:orderId/reconcile
POST /tenant/repair-payment-orders/:orderId/cancel
POST /tenant/repair-payment-orders/:orderId/retry
```

Use private controller helpers for actor construction and public redaction so manager/tenant handlers cannot drift.

- [ ] **Step 4: Wire persistence and unavailable behavior**

Register `RepairPaymentOrderController`, repository token/provider, and `RepairPaymentOrderService` in `CreditModule`. Reuse the module's `CreditPrismaClient`, `DOMAIN_EVENT_REPOSITORY`, `TOSS_PAYMENT_GATEWAY`, and options. When `DATABASE_URL` is absent, every order repository method throws the existing finance service-unavailable message; it must not return demo mutation success.

- [ ] **Step 5: Run controller and module tests GREEN**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/credit/repair-payment-order.controller.spec.ts src/credit/credit-module-wiring.spec.ts
```

Expected: both roles delegate correctly, public secrets are absent, and the real Prisma provider is wired when a database URL exists.

- [ ] **Step 6: Commit API wiring**

```bash
cd ../../
git add apps/api/src/credit/repair-payment-order.controller.ts apps/api/src/credit/repair-payment-order.controller.spec.ts apps/api/src/credit/credit.module.ts apps/api/src/credit/credit-module-wiring.spec.ts
git commit -m "feat(payment): expose repair order APIs"
```

---

### Task 9: Close exhaustive status consumers without adding M2 UI

**Files:**
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/web/src/lib/vendor-workflow-presenter.ts`
- Modify: `apps/web/src/lib/vendor-workflow-ui.spec.ts`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`

**Interfaces:**
- Produces: build-compatible, truthful status labels
- Excludes: Toss button, widget, callback pages, retry controls

- [ ] **Step 1: Add failing label assertions**

Assert `TOSS_PAID` renders `Toss 결제 완료` in vendor workflow and manager credit presentation. Assert it uses the positive tone. Do not add it to credit reversal or direct-payment void action branches because refund is out of scope.

- [ ] **Step 2: Run focused web tests RED**

```bash
pnpm --filter web test
```

Expected: exhaustive status records or new assertions fail.

- [ ] **Step 3: Update only compatibility labels**

Add the `TOSS_PAID` label to all exhaustive maps, the API-side vendor status label, and the positive-tone predicate. Keep buttons and recovery UX unchanged for M2/M5.

- [ ] **Step 4: Run web and API build GREEN**

```bash
pnpm --filter web test
pnpm --filter web build
pnpm --filter api build
```

Expected: all pass without a new Toss UI surface.

- [ ] **Step 5: Commit compatibility updates**

```bash
git add apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/web/src/lib/vendor-workflow-presenter.ts apps/web/src/lib/vendor-workflow-ui.spec.ts apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
git commit -m "fix(payment): present Toss-paid requests"
```

---

### Task 10: Full regression, Docker rebuild, and M1 checkpoint

**Files:**
- Verify: all M1 files and unchanged billing/deposit boundaries
- Update: `docs/superpowers/plans/2026-07-15-repair-payment-order-m1.md` checkboxes only as each command proves completion

**Interfaces:**
- Produces: reviewed M1 checkpoint ready for M2, not a UI-complete feature

- [x] **Step 1: Re-check dev before final verification**

```bash
git fetch origin dev
git rev-list --left-right --count HEAD...origin/dev
```

Expected: right-side count is zero. If not, merge `origin/dev` now and repeat every following command after the merge.

- [x] **Step 2: Reset the test DB and run complete tests**

```bash
docker compose up -d postgres
export ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public'
bash scripts/reset-test-db.sh
pnpm run db:generate
pnpm test:api
pnpm test:web
```

Expected: all tests pass, including manager/tenant isolation, order races, gateway failure modes, old credit settlement, billing, and financial boundary suites.

- [x] **Step 3: Run the repository verification script**

```bash
bash scripts/verify.sh
```

Expected: types, ui, web build, api build, and source-level API smoke all pass.

- [x] **Step 4: Rebuild the Docker API and verify startup**

```bash
docker compose up -d --build api
docker compose ps
docker compose logs --tail=160 api
curl -fsS http://localhost:4000/api/health
```

Expected: postgres and API are healthy/running, Nest registers the repair-payment routes without dependency errors, and health returns HTTP 200.

- [x] **Step 5: Inspect the final diff and forbidden scope**

```bash
git status --short
git diff --stat origin/dev...HEAD
git diff --check
rg -n "billingKey|빌링키|paymentMethodKey|AI prompt|Realtime API" packages/types/src/repair-payment.ts apps/api/src/credit/repair-payment-order* prisma/migrations/20260715140000_repair_payment_orders
```

Expected: no whitespace errors; no billing-key or AI implementation leaked into M1. The only web changes are compile-compatible status labels.

- [x] **Step 6: Commit any verification-only corrections**

```bash
git add docs/superpowers/plans/2026-07-15-repair-payment-order-m1.md
git commit -m "test(payment): verify repair order foundation"
```

Skip this commit when the plan checkbox file has no new change and the worktree is already clean.

## M1 Exit Criteria

- Existing manager requests are backfilled with immutable manager payer authority.
- A future tenant-owned request can use the same repository and API without manager access.
- One payment request has at most one active Toss order under concurrent calls.
- Create, confirm, finalization, failure, reconciliation, cancellation, and retry are idempotent and state-guarded.
- Approved Toss payment produces `TOSS_PAID`, one Cost, one audit, one vendor event, no credit ledger mutation, and no duplicate `VendorPaymentAttempt`.
- Manager and tenant cannot access each other's orders.
- Public responses never expose internal IDs, payment keys, payer user IDs, or AI audit IDs.
- Existing credit topup, automatic credit, manual credit, external direct-payment record, bill payment, and Deposit behavior remains green.
- `bash scripts/verify.sh`, full tests, Docker API rebuild, and health smoke pass after the latest `origin/dev` merge.
