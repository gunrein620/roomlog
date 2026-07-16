# Manager Credit Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 모든 데스크톱 관리자 화면에서 잔액을 확인하고 Toss 테스트 결제로 크레딧을 충전하며, 승인된 업체 완료 건을 정책에 따라 한 번만 결제·취소할 수 있는 원자적 크레딧 시스템을 구축한다.

**Architecture:** 금융 진실의 출처는 `RoomlogStore`나 비동기 projector가 아니라 awaited direct Prisma `CreditCommandRepository`와 같은 DB를 읽는 query repository다. Toss 승인 호출은 DB transaction 밖에서 실행하고 `READY → CONFIRMING` CAS와 order 조회 reconciliation으로 외부 성공/로컬 실패를 복구한다. 업체 workflow는 완료 승인과 `VendorPaymentRequest`, immutable event, `CREDIT_EVALUATION` delivery 생성까지 소유한다. Roomlog의 durable worker가 Credit adapter를 호출하며 Credit 모듈은 정책 평가·attempt·원장·잔액·Cost·감사/notification delivery를 원자적으로 처리한다. credit commit 뒤 worker가 죽어도 같은 completion decision replay는 `ALREADY_FINAL`로 수렴한다.

**Tech Stack:** TypeScript 5.9, NestJS 11, Prisma 7.8 + PostgreSQL 18, Next.js 16 App Router, React 19, Toss Payments Standard SDK v2, Node `node:test`, pnpm 11, docker-compose.

## Global Constraints

- 이 계획은 vendor foundation migrations `20260714100000`, `20260714101000`과 vendor workflow migration `20260714110000`이 적용되고 관련 테스트가 통과한 뒤 시작한다. 세 선행 migration 파일은 수정하지 않는다.
- workflow는 `RepairCompletionDecision`, `VendorPaymentRequest`, 승인 event와 consumer별 delivery 생성까지 소유한다. Credit은 durable `CREDIT_EVALUATION` delivery 소비 이후 정책 평가, attempt, 결제, 원장, Cost, reversal/void를 소유한다.
- 공유 계약 파일은 반드시 `packages/types/src/vendor-credit.ts`, 신규 migration은 반드시 `prisma/migrations/20260714120000_vendor_credit/migration.sql`을 사용한다.
- 모든 금융 명령과 조회는 awaited direct Prisma를 사용한다. `RoomlogStore`, `StoreProjector`, fire-and-forget persistence를 잔액·원장·결제 판정에 사용하지 않는다.
- `CreditLedgerEntry`는 append-only다. 충전·차감·취소는 각각 유일한 서버 검증 idempotency key를 사용한다.
- 원화 금액은 0보다 큰 정수만 입력받고 API 경계에서 `Number.isSafeInteger`를 검증한다. DB의 크레딧 금액과 잔액은 `BIGINT`로 저장하며 JSON 응답 직전에 안전한 `number`로 변환한다.
- 임차인 `BillPaymentTransaction`, 임대 수금 `Deposit`, 크레딧 충전 주문, 크레딧 원장은 서로 재사용하거나 통계에 합치지 않는다.
- `FAILED` topup은 Toss가 확정 거절한 경우에만 사용한다. timeout, network error, 429, 5xx, 응답 소실, 승인 후 로컬 commit 실패는 `RECONCILIATION_REQUIRED` 또는 stale `CONFIRMING`으로 보존한다.
- 외부 Toss HTTP 호출 중 DB transaction을 열어 두지 않는다.
- 자동결제는 최신 완료보고에 대한 `source=MANAGER`, `decision=APPROVED` 결정, `LANDLORD` 부담, 현재 승인 견적 ID·금액 일치, 정책·한도·잔액 조건을 모두 transaction 안에서 다시 검증한다.
- `INSUFFICIENT_CREDIT`는 충전 후 자동 재시도하지 않는다. 관리자가 같은 요청에서 새 `MANUAL_CREDIT` attempt를 명시적으로 실행해야 한다.
- 결제 성공 transaction은 request 상태, `completionDecisionId`, succeeded attempt, 잔액/ledger(크레딧 방식만), `Cost(CONFIRMED, ALREADY_PAID)`, audit, outbox를 함께 commit한다.
- reversal/void는 최종 회계 정정이다. 연결 Cost를 `VOID`로 바꾸고 같은 payment request를 재결제하지 않는다.
- 금융 transaction은 안정적인 `eventKey`의 immutable event와 `NOTIFICATION` delivery를 함께 기록한다. 실제 알림 발행은 commit 후 dispatcher가 수행하며, workflow의 `CREDIT_EVALUATION` delivery와 독립적으로 완료된다.
- `PENDING_APPROVAL`/`INSUFFICIENT_CREDIT`/`AUTO_PAID`/최종 상태 replay는 동일 자동 idempotency key와 audit `dedupeKey`로 중복 attempt·ledger·Cost·알림을 만들지 않는다.
- 관리자 식별자는 인증 토큰에서만 도출한다. body, query, path의 `managerId`를 신뢰하지 않는다.
- 웹 demo fallback은 GET/read 렌더에만 허용한다. topup, policy update, settlement, reversal, void mutation은 API 오류를 성공으로 가장하지 않는다.
- 관리자 복귀 경로는 서버가 검증한 `/manager` 내부 경로만 허용한다. scheme, host, `//` 시작 경로와 외부 URL을 거부한다.
- 모든 데스크톱 `ManagerAppShell` 화면의 정식 `headerActions`에 잔액과 충전 버튼을 표시한다. `PhoneFrame`을 쓰는 call·vox에는 표시하지 않는다.
- 업체관리 내부 탭 표기는 `내 업체 | 업체 찾기 | 크레딧·결제`로 고정하고 credit 경로는 `/manager/vendor-mgmt/credit`이다.
- 충전 모달 빠른 금액은 정확히 `100,000 / 300,000 / 500,000 / 1,000,000원`이며 현재 잔액, 직접 입력, 예상 잔액, `취소 / 결제 진행`만 포함한다.
- 새 UI CSS는 `packages/ui/src/tokens.css`의 `var(--...)`만 사용한다. raw hex, 임의 rgba, 색상 literal을 추가하지 않는다.
- 프로덕션 web image build/runtime에 `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 전달한다. secret key는 API 환경에만 둔다.
- 기본 개발·검증 환경은 docker-compose이며 최종 완료 전 `bash scripts/verify.sh`, API tests, web tests를 모두 실행한다.

---

## Dependency Contract With Earlier Plans

`20260714110000` workflow가 다음 DB 원본과 서비스 후크를 제공해야 한다.

```ts
type WorkflowCreditPrerequisite = Readonly<{
  paymentRequestId: string;
  repairId: string;
  managerId: string;
  approvedEstimateId: string;
  completionReportId: string;
  amount: number;
  status: "WAITING_COMPLETION";
}>;
```

완료 승인 transaction은 `CREDIT_EVALUATION` delivery를 commit한다. Roomlog의 `CompletionCreditDeliveryWorker`가 다음 경계를 호출하며, 실패·crash·lease expiry는 같은 `completionDecisionId`와 `auto:<paymentRequestId>:<completionDecisionId>` key로 재시도한다.

```ts
const adapter: VendorCompletionCreditBoundary = {
  availability: "READY",
  evaluateAfterCompletion: (input) => creditService.evaluateAfterCompletion(input)
};
```

worker는 committed event에서만 입력을 만들고 Credit은 전달 상태를 그대로 신뢰하지 않는다. transaction 안에서 request, 최신 completion report, manager `APPROVED` decision, approved estimate, repair cost bearer를 다시 읽는다. 성공 결과나 `PENDING_APPROVAL`/`INSUFFICIENT_CREDIT`/`ALREADY_FINAL` 뒤에만 worker가 delivery를 `DELIVERED`로 CAS한다.

## File and Responsibility Map

- `packages/types/src/vendor-credit.ts`: web/API가 공유하는 credit account, ledger, topup, policy, payment workspace DTO와 mutation input/result.
- `prisma/migrations/20260714120000_vendor_credit/migration.sql`: credit tables, attempt table, ledger/request linkage, CHECK/FK/partial unique/reversal trigger, manager-only topup event를 위한 nullable outbox vendorId.
- `apps/api/src/payment/toss-payment.gateway.ts`: tenant bill payment와 manager topup이 공유하는 Toss confirm/order lookup adapter 및 오류 분류.
- `apps/api/src/auth/bearer-token.ts`: legacy auth와 CreditController가 공유하는 HMAC bearer subject 검증.
- `apps/api/src/credit/credit-command.repository.ts`: 금융 command interface와 DI token.
- `apps/api/src/credit/credit-query.repository.ts`: direct DB query interface와 DI token.
- `apps/api/src/credit/credit-prisma.client.ts`: Prisma 7 `PrismaPg` client provider와 lifecycle.
- `apps/api/src/credit/prisma-credit-command.repository.ts`: topup, policy, settle, reverse, void의 awaited Prisma transactions.
- `apps/api/src/credit/prisma-credit-query.repository.ts`: balance, ledger, topup, payment request workspace direct DB projections.
- `apps/api/src/credit/credit.service.ts`: Toss 호출을 transaction 밖에서 orchestration하고 workflow 후크를 제공.
- `apps/api/src/credit/credit.controller.ts`: token-derived manager endpoints.
- `apps/api/src/credit/credit.module.ts`: controller와 금융 provider wiring, `CreditService` export; `RoomlogModule`을 import하지 않는다.
- `apps/api/src/domain-events/domain-events.module.ts`: `RealtimeModule`만 import하며 event repository/notification dispatcher를 export; CreditModule이 transaction writer로 import.
- `apps/api/src/roomlog/completion-credit-delivery.worker.ts`: workflow 계획이 만든 durable worker; credit 계획은 파일을 복제하지 않고 READY adapter로 backlog를 drain.
- `apps/api/src/roomlog/services/prisma-financial-cost.reader.ts`: finance-owned Cost의 direct DB read overlay.
- `apps/web/src/lib/vendor-credit-api.ts`: server-side GET fallback와 hard-fail mutations.
- `apps/web/src/lib/demo-vendor-credit.ts`: 100,000 opening + 500,000 topup - 120,000 debit = 480,000 demo projection.
- `apps/web/src/lib/credit-return-path.ts`: manager 내부 복귀 경로 정규화.
- `apps/web/src/lib/toss-payments.ts`: 기존 tenant form에서 추출한 Toss SDK types/loader/request helper.
- `apps/web/src/lib/vendor-credit-events.ts`: 전역 header utility의 단일 topup modal을 여는 client event 계약.
- `apps/web/src/app/manager/_components/ManagerCreditUtility.tsx`: 전역 잔액, 충전 modal, Toss 시작, 복귀 결과 갱신.
- `apps/web/src/app/manager/vendor-mgmt/credit/*`: balance, ledger, policy, payment request workspace.
- `apps/web/src/app/manager/credit-topup/{success,fail}/page.tsx`: 서버 confirm/cancel 후 저장된 return path 복귀.

### Task 1: Shared Contract and Credit Migration

- [ ] **Task 1 완료 조건:** 공유 타입 build와 migration-backed schema test가 통과하고, 선행 100000/101000/110000 migration을 수정하지 않은 별도 schema commit이 존재한다.

**Files:**
- Create: `packages/types/src/vendor-credit.ts`
- Modify: `packages/types/src/index.ts:1-20`
- Verify: `packages/types/src/domain-event.ts` already includes `VENDOR_PAYMENT_REVERSED` and optional resource IDs from workflow Task 1
- Modify: `prisma/schema.prisma:84-159,487-601,1045-1076` 및 workflow가 추가한 `VendorPaymentRequest` 모델
- Create: `prisma/migrations/20260714120000_vendor_credit/migration.sql`
- Create: `apps/api/src/credit/vendor-credit.contract.spec.ts`
- Create: `apps/api/src/credit/vendor-credit.schema.spec.ts`
- Modify: `package.json:8-22`

**Interfaces:**
- Consumes: workflow의 `VendorPaymentRequest`, `RepairCompletionDecision`, `VendorPaymentAuditEvent`, shared outbox 모델; 기존 `Cost`와 `RepairPaymentState`.
- Produces: `ManagerCreditAccountView`, `ManagerCreditWorkspace`, `ManagerCreditTopupOrderView`, `CreateManagerCreditTopupInput`, `ConfirmManagerCreditTopupInput`, `UpdateAutoPayPolicyInput`, `SettleVendorPaymentRequestInput`, `ReverseVendorCreditPaymentInput`, `VoidVendorDirectPaymentInput`, `CancelVendorPaymentRequestInput`; exact `VendorPaymentAttempt` and ledgerless command receipt tables.

- [ ] **Step 1: Write the failing shared-contract test**

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type {
  CreateManagerCreditTopupInput,
  ManagerCreditWorkspace,
  SettleVendorPaymentRequestInput
} from "@roomlog/types";

describe("vendor credit shared contract", () => {
  it("represents the 480,000 won golden projection", () => {
    const input: CreateManagerCreditTopupInput = {
      amount: 500_000,
      creationKey: "topup-demo-500000",
      returnPath: "/manager/home"
    };
    const settlement: SettleVendorPaymentRequestInput = {
      mode: "MANUAL_CREDIT",
      idempotencyKey: "settle-demo-120000"
    };
    const workspace = {
      account: { id: "credit_demo", balance: 480_000, updatedAt: "2026-07-14T00:00:00.000Z" },
      policy: { mode: "AUTO_DEBIT_UNDER_LIMIT", perRequestLimit: 150_000, updatedAt: "2026-07-14T00:00:00.000Z" },
      ledgerEntries: [],
      topupOrders: [],
      paymentRequests: []
    } satisfies ManagerCreditWorkspace;

    assert.equal(input.amount, 500_000);
    assert.equal(settlement.mode, "MANUAL_CREDIT");
    assert.equal(workspace.account.balance, 480_000);
  });
});
```

In `vendor-credit.schema.spec.ts`, use `ROOMLOG_TEST_DATABASE_URL` and query `information_schema.tables`, `pg_indexes`, and `pg_constraint`. Assert the four credit tables plus `VendorPaymentAttempt` and `VendorPaymentCommandReceipt`, both attempt partial unique indexes, ledger partial unique indexes, nonnegative/sign CHECKs, nullable outbox vendorId, predecessor delivery schema/event enum value, and the reversal trigger all exist.

- [ ] **Step 2: Run the contract test to verify RED**

Run: `pnpm --filter api exec node --test -r ts-node/register src/credit/vendor-credit.contract.spec.ts src/credit/vendor-credit.schema.spec.ts`

Expected: FAIL with missing exports from `@roomlog/types`.

- [ ] **Step 3: Add the complete shared DTO contract and export it**

`packages/types/src/vendor-credit.ts` must define these exact public shapes; dates are ISO strings and no Prisma `bigint` escapes the API.

```ts
import type { VendorPaymentAttemptMode, VendorPaymentRequestStatus } from "./vendor-workflow";

export type CreditLedgerEntryType =
  | "OPENING_BALANCE"
  | "TOPUP"
  | "AUTO_DEBIT"
  | "MANUAL_DEBIT"
  | "REVERSAL";

export type CreditTopupOrderStatus =
  | "READY"
  | "CONFIRMING"
  | "RECONCILIATION_REQUIRED"
  | "APPROVED"
  | "FAILED"
  | "CANCELLED";

export type AutoPayPolicyMode = "ALWAYS_REQUIRE_APPROVAL" | "AUTO_DEBIT_UNDER_LIMIT";
export type VendorPaymentSettlementMode = "MANUAL_CREDIT" | "DIRECT";

export interface ManagerCreditAccountView {
  id: string;
  balance: number;
  updatedAt: string;
}

export interface ManagerCreditLedgerEntryView {
  id: string;
  type: CreditLedgerEntryType;
  signedAmount: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  reversesLedgerEntryId?: string;
  createdAt: string;
}

export interface ManagerCreditTopupOrderView {
  id: string;
  orderId: string;
  amount: number;
  status: CreditTopupOrderStatus;
  paymentKey?: string;
  method?: string;
  failureReason?: string;
  returnPath: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagerAutoPayPolicyView {
  mode: AutoPayPolicyMode;
  perRequestLimit?: number;
  updatedAt: string;
}

export interface ManagerVendorPaymentRequestView {
  id: string;
  repairId: string;
  vendorId: string;
  approvedEstimateId: string;
  completionReportId: string;
  completionDecisionId?: string;
  amount: number;
  status: VendorPaymentRequestStatus;
  failureReason?: string;
  lastAttemptMode?: VendorPaymentAttemptMode;
  ledgerEntryId?: string;
  costId?: string;
  createdAt: string;
  processedAt?: string;
}

export interface ManagerCreditWorkspace {
  account: ManagerCreditAccountView;
  policy: ManagerAutoPayPolicyView;
  ledgerEntries: ManagerCreditLedgerEntryView[];
  topupOrders: ManagerCreditTopupOrderView[];
  paymentRequests: ManagerVendorPaymentRequestView[];
  nextCursor?: string;
}

export interface CreateManagerCreditTopupInput {
  amount: number;
  creationKey: string;
  returnPath: string;
}

export interface ManagerCreditTopupCheckout {
  order: ManagerCreditTopupOrderView;
  clientKey: string;
  customerKey: string;
  orderName: string;
}

export interface ConfirmManagerCreditTopupInput {
  paymentKey: string;
  amount: number;
}

export interface UpdateAutoPayPolicyInput {
  mode: AutoPayPolicyMode;
  perRequestLimit?: number;
}

export interface SettleVendorPaymentRequestInput {
  mode: VendorPaymentSettlementMode;
  idempotencyKey: string;
}

export interface ReverseVendorCreditPaymentInput {
  idempotencyKey: string;
  note: string;
}

export interface VoidVendorDirectPaymentInput {
  idempotencyKey: string;
  note: string;
}

export interface CancelVendorPaymentRequestInput {
  idempotencyKey: string;
  note: string;
}
```

Add `export * from "./vendor-credit";` to `packages/types/src/index.ts`.

- [ ] **Step 4: Add Prisma models and the fixed migration**

Add the following exact Prisma enums/models. Use `BigInt` for credit money. Consume workflow 110000's authoritative `VendorPaymentRequest.costId String? @unique` and Cost relation without recreating them; add its typed ledger relation, unique `ledgerEntryId`, attempts, and command receipts.

```prisma
enum CreditLedgerEntryType { OPENING_BALANCE TOPUP AUTO_DEBIT MANUAL_DEBIT REVERSAL }
enum CreditTopupOrderStatus { READY CONFIRMING RECONCILIATION_REQUIRED APPROVED FAILED CANCELLED }
enum AutoPayPolicyMode { ALWAYS_REQUIRE_APPROVAL AUTO_DEBIT_UNDER_LIMIT }

model CreditAccount {
  id            String @id
  managerId     String @unique
  balance       BigInt @default(0)
  version       Int @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  manager       UserAccount @relation("ManagerCreditAccount", fields: [managerId], references: [id], onDelete: Restrict)
  ledgerEntries CreditLedgerEntry[]
  topupOrders   CreditTopupOrder[]
  @@unique([id, managerId])
}

model CreditLedgerEntry {
  id                     String @id
  creditAccountId        String
  type                   CreditLedgerEntryType
  signedAmount           BigInt
  balanceAfter           BigInt
  referenceType          String
  referenceId            String
  idempotencyKey         String @unique
  reversesLedgerEntryId  String? @unique
  createdAt              DateTime @default(now())
  creditAccount          CreditAccount @relation(fields: [creditAccountId], references: [id], onDelete: Restrict)
  reverses               CreditLedgerEntry? @relation("CreditLedgerReversal", fields: [reversesLedgerEntryId], references: [id], onDelete: Restrict)
  reversedBy             CreditLedgerEntry? @relation("CreditLedgerReversal")
  paymentRequest         VendorPaymentRequest?
  paymentAttempt         VendorPaymentAttempt?
  @@index([creditAccountId, createdAt])
  @@index([referenceType, referenceId])
}

model CreditTopupOrder {
  id               String @id
  creditAccountId  String
  managerId        String
  orderId          String @unique
  creationKey      String @unique
  payloadHash      String
  amount           BigInt
  status           CreditTopupOrderStatus @default(READY)
  paymentKey       String? @unique
  method           String?
  failureReason    String?
  returnPath       String
  approvedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  creditAccount    CreditAccount @relation(fields: [creditAccountId, managerId], references: [id, managerId], onDelete: Restrict)
  @@index([managerId, status, updatedAt])
}

model AutoPayPolicy {
  id               String @id
  managerId        String @unique
  mode             AutoPayPolicyMode @default(ALWAYS_REQUIRE_APPROVAL)
  perRequestLimit  BigInt?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  manager          UserAccount @relation("ManagerAutoPayPolicy", fields: [managerId], references: [id], onDelete: Restrict)
}
```

Add `creditAccount CreditAccount? @relation("ManagerCreditAccount")` and `autoPayPolicy AutoPayPolicy? @relation("ManagerAutoPayPolicy")` on `UserAccount`, plus the typed ledger/attempt/receipt reverse relations on `VendorPaymentRequest`. Every account balance mutation increments `CreditAccount.version`; every stale topup decision uses `CreditTopupOrder.updatedAt`, and same `creationKey` compares the stored canonical `payloadHash` covering manager, amount, and normalized return path. The attempt/receipt shape is exact:

```prisma
enum VendorPaymentAttemptStatus { STARTED SUCCEEDED INSUFFICIENT_CREDIT FAILED }
enum VendorPaymentCommandType { CREDIT_REVERSAL DIRECT_VOID PAYMENT_CANCEL }

model VendorPaymentAttempt {
  id                   String @id
  paymentRequestId     String
  completionDecisionId String?
  mode                 VendorPaymentAttemptMode
  status               VendorPaymentAttemptStatus @default(STARTED)
  idempotencyKey       String @unique
  payloadHash          String
  actorUserId          String
  ledgerEntryId        String? @unique
  failureReason        String?
  createdAt            DateTime @default(now())
  completedAt          DateTime?
  paymentRequest       VendorPaymentRequest @relation(fields: [paymentRequestId], references: [id])
  completionDecision   RepairCompletionDecision? @relation(fields: [completionDecisionId], references: [id])
  ledgerEntry          CreditLedgerEntry? @relation(fields: [ledgerEntryId], references: [id])
  @@index([paymentRequestId, createdAt])
}

model VendorPaymentCommandReceipt {
  id               String @id
  idempotencyKey   String @unique
  paymentRequestId String
  commandType      VendorPaymentCommandType
  payloadHash      String
  resultStatus     VendorPaymentRequestStatus
  createdAt        DateTime @default(now())
  paymentRequest   VendorPaymentRequest @relation(fields: [paymentRequestId], references: [id])
  @@index([paymentRequestId, createdAt])
}
```

`VendorPaymentAuditEvent.dedupeKey` was created by workflow and remains the audit idempotency boundary. Automatic evaluation uses `auto:<paymentRequestId>:<completionDecisionId>` as the attempt key. Reversal, direct void, and post-approval cancel use `VendorPaymentCommandReceipt`; the same key/same canonical payload returns the stored result, while the same key/different request/type/payload is `409 Conflict`.

The migration must contain concrete database invariants equivalent to:

```sql
ALTER TABLE "CreditAccount"
  ADD CONSTRAINT "CreditAccount_balance_nonnegative" CHECK ("balance" >= 0);

ALTER TABLE "CreditLedgerEntry"
  ADD CONSTRAINT "CreditLedgerEntry_sign_by_type" CHECK (
    ("type" IN ('OPENING_BALANCE', 'TOPUP') AND "signedAmount" > 0 AND "reversesLedgerEntryId" IS NULL)
    OR ("type" IN ('AUTO_DEBIT', 'MANUAL_DEBIT') AND "signedAmount" < 0 AND "reversesLedgerEntryId" IS NULL)
    OR ("type" = 'REVERSAL' AND "signedAmount" > 0 AND "reversesLedgerEntryId" IS NOT NULL)
  ),
  ADD CONSTRAINT "CreditLedgerEntry_balance_after_nonnegative" CHECK ("balanceAfter" >= 0);

CREATE UNIQUE INDEX "CreditLedgerEntry_one_opening_per_account"
  ON "CreditLedgerEntry" ("creditAccountId")
  WHERE "type" = 'OPENING_BALANCE';

CREATE UNIQUE INDEX "CreditLedgerEntry_one_debit_per_payment_request"
  ON "CreditLedgerEntry" ("referenceId")
  WHERE "referenceType" = 'VENDOR_PAYMENT_REQUEST'
    AND "type" IN ('AUTO_DEBIT', 'MANUAL_DEBIT');

CREATE UNIQUE INDEX "VendorPaymentAttempt_one_success_per_request"
  ON "VendorPaymentAttempt" ("paymentRequestId")
  WHERE "status" = 'SUCCEEDED';

CREATE UNIQUE INDEX "VendorPaymentAttempt_one_auto_per_decision"
  ON "VendorPaymentAttempt" ("paymentRequestId", "completionDecisionId")
  WHERE "mode" = 'AUTO_CREDIT' AND "completionDecisionId" IS NOT NULL;
```

Also create unconditional unique constraints for account managerId, ledger idempotencyKey, ledger reversesLedgerEntryId, topup orderId/creationKey/paymentKey, policy managerId, attempt idempotencyKey, and request ledgerEntryId. Add FKs for ledger→account, attempt→request, attempt→ledger, request→ledger, and reversal→original ledger with restrictive delete behavior.

Create a `BEFORE INSERT` trigger on `CreditLedgerEntry` for `REVERSAL`: load the referenced row, require the same `creditAccountId`, require original type `AUTO_DEBIT` or `MANUAL_DEBIT`, and require `NEW.signedAmount = -original.signedAmount`. Add topup state CHECKs so READY has no result fields, APPROVED has `paymentKey`, `method`, `approvedAt`, FAILED has `failureReason`, and CANCELLED is only persisted without approval fields. Add positive amount and auto-policy mode/limit CHECKs.

Workflow outbox events already include manager credit topup/payment event types, but a topup has no real vendor. Preserve `RoomlogDomainEvent.vendorId?: string`, require `VENDOR_PAYMENT_REVERSED`, `VENDOR_PAYMENT_CANCELLED`, and `VENDOR_DIRECT_PAYMENT_VOIDED` in the shared type and workflow 110000 enum before this migration runs, and keep `DomainEventOutbox.vendorId` nullable; the credit schema test probes those predecessor enum values rather than adding them late. Never write a fake vendor ID.

Replace the implementation behind root `db:test:push` so it refuses non-`roomlog_test` database names, drops only that database's `public` schema, then executes `DATABASE_URL="$ROOMLOG_TEST_DATABASE_URL" pnpm exec prisma migrate deploy`. Prisma reads `DATABASE_URL`, so merely exporting `ROOMLOG_TEST_DATABASE_URL` is insufficient. Do not use `prisma migrate diff --from-empty` or schema push, because they omit raw SQL constraints, triggers, and partial indexes.

- [ ] **Step 5: Generate the client and apply every migration to the test DB**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm db:test:push
```

Expected: typecheck and Prisma generation succeed; migrate deploy applies 100000, 101000, 110000, and `20260714120000_vendor_credit` in order.

- [ ] **Step 6: Run GREEN and commit the contract/schema boundary**

Run: `ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/vendor-credit.contract.spec.ts src/credit/vendor-credit.schema.spec.ts`

Expected: PASS for the shared contract and every migration invariant probe.

```bash
git add packages/types/src/vendor-credit.ts packages/types/src/index.ts prisma/schema.prisma prisma/migrations/20260714120000_vendor_credit/migration.sql apps/api/src/credit/vendor-credit.contract.spec.ts apps/api/src/credit/vendor-credit.schema.spec.ts package.json
git commit -m "feat: define manager credit ledger schema"
```

### Task 2: Reusable Toss Confirm and Order-Lookup Gateway

- [ ] **Task 2 완료 조건:** tenant bill confirm still uses the extracted adapter, credit can query by order ID, and deterministic rejection is distinguishable from uncertain transport/provider failure.

**Files:**
- Create: `apps/api/src/payment/toss-payment.gateway.ts`
- Create: `apps/api/src/payment/toss-payment.gateway.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts:2171-2188`
- Modify: `apps/api/src/roomlog/roomlog.service.ts:2366-2405,2425-2455`

**Interfaces:**
- Consumes: `TOSS_SECRET_KEY`, Toss `/v1/payments/confirm`, Toss `/v1/payments/orders/{orderId}`.
- Produces: `TossPaymentGateway.confirmPayment`, `TossPaymentGateway.getPaymentByOrderId`, `TossPaymentGatewayError.kind`.

- [ ] **Step 1: Write adapter RED tests**

Test exact cases with an injected `fetchImpl`: DONE confirm mapping, order lookup mapping, network/429/5xx as `UNKNOWN`, and a deterministic 4xx rejection as `DECLINED`.

```ts
it("classifies a network failure as UNKNOWN", async () => {
  const gateway = new TossPaymentsHttpGateway("test_sk", async () => {
    throw new TypeError("socket closed");
  });

  await assert.rejects(
    gateway.confirmPayment({ paymentKey: "pay_1", orderId: "credit_1", amount: 500_000 }),
    (error: unknown) => error instanceof TossPaymentGatewayError && error.kind === "UNKNOWN"
  );
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter api exec node --test -r ts-node/register src/payment/toss-payment.gateway.spec.ts`

Expected: FAIL because `toss-payment.gateway.ts` does not exist.

- [ ] **Step 3: Implement the minimal reusable adapter**

```ts
export interface TossConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPaymentSnapshot {
  paymentKey: string;
  orderId: string;
  amount: number;
  status: string;
  method?: string;
  approvedAt?: string;
}

export interface TossPaymentGateway {
  confirmPayment(input: TossConfirmPaymentInput): Promise<TossPaymentSnapshot>;
  getPaymentByOrderId(orderId: string): Promise<TossPaymentSnapshot>;
}

export class TossPaymentGatewayError extends Error {
  constructor(
    readonly kind: "DECLINED" | "UNKNOWN",
    readonly code: string,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}
```

`TossPaymentsHttpGateway` must use Basic auth, JSON bodies, `AbortController` timeout, and URL-encode `orderId`. Treat network error, timeout, 429, 5xx, `ALREADY_PROCESSED_PAYMENT`, and provider/internal unknown codes as `UNKNOWN`; all remaining validated 4xx errors are `DECLINED`. Normalize both endpoints into `TossPaymentSnapshot` and reject malformed success bodies as `UNKNOWN`.

Remove the private adapter from `roomlog.service.ts`, import this class/interface, and preserve `createTenantBillPaymentOrder`/`confirmTenantBillPayment` behavior for this task. Do not yet migrate tenant bill state semantics into the credit tables.

- [ ] **Step 4: Run focused and legacy GREEN**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/payment/toss-payment.gateway.spec.ts
pnpm --filter api build
```

Expected: adapter tests PASS and API build succeeds without duplicate Toss type definitions.

- [ ] **Step 5: Commit the payment boundary**

```bash
git add apps/api/src/payment/toss-payment.gateway.ts apps/api/src/payment/toss-payment.gateway.spec.ts apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/roomlog.service.ts
git commit -m "refactor: extract reusable Toss gateway"
```

### Task 3: Direct Prisma Topup Command and Query Repositories

- [ ] **Task 3 완료 조건:** concurrent topup claim has one winner, finalize is atomic/idempotent, and all account/order/ledger reads come from direct Prisma.

**Files:**
- Create: `apps/api/src/credit/credit-prisma.client.ts`
- Create: `apps/api/src/credit/credit-command.repository.ts`
- Create: `apps/api/src/credit/credit-query.repository.ts`
- Create: `apps/api/src/credit/prisma-credit-command.repository.ts`
- Create: `apps/api/src/credit/prisma-credit-query.repository.ts`
- Create: `apps/api/src/credit/prisma-credit-command.repository.spec.ts`

**Interfaces:**
- Consumes: Task 1 Prisma models and workflow outbox transaction writer.
- Produces: direct repository methods used by `CreditService`; no method accepts `RoomlogStore`.

- [ ] **Step 1: Write real-Postgres RED tests**

Use the existing `ROOMLOG_TEST_DATABASE_URL` skip pattern and unique IDs. Cover:

```ts
const claims = await Promise.all([
  repository.claimTopupConfirmation({ managerId, orderId, paymentKey, amount: 500_000 }),
  repository.claimTopupConfirmation({ managerId, orderId, paymentKey, amount: 500_000 })
]);
assert.equal(claims.filter((claim) => claim.outcome === "CLAIMED").length, 1);

await repository.finalizeTopup({ managerId, orderId, payment });
await repository.finalizeTopup({ managerId, orderId, payment });
assert.equal(await prisma.creditLedgerEntry.count({ where: { referenceId: orderId } }), 1);
assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { managerId } })).balance, 500_000n);
```

Also test same `creationKey` + same payload returns the same order, same key + different amount/path conflicts, amount mismatch cannot claim, READY cancellation is idempotent, and direct query projections convert bigint safely.

- [ ] **Step 2: Run RED against docker Postgres**

Run:

```bash
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm db:test:push
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/prisma-credit-command.repository.spec.ts
```

Expected: FAIL because repository files do not exist.

- [ ] **Step 3: Define the exact command/query contracts**

```ts
export const CREDIT_COMMAND_REPOSITORY = Symbol("CREDIT_COMMAND_REPOSITORY");

export interface CreditCommandRepository {
  ensureAccount(input: Readonly<{ managerId: string }>): Promise<ManagerCreditAccountView>;
  createTopupOrder(input: CreateTopupOrderCommand): Promise<CreateTopupOrderResult>;
  claimTopupConfirmation(input: ClaimTopupConfirmationCommand): Promise<TopupConfirmationClaim>;
  finalizeTopup(input: FinalizeTopupCommand): Promise<FinalizeTopupResult>;
  markTopupRejected(input: MarkTopupRejectedCommand): Promise<ManagerCreditTopupOrderView>;
  markTopupUncertain(input: MarkTopupUncertainCommand): Promise<ManagerCreditTopupOrderView>;
  cancelReadyTopup(input: CancelReadyTopupCommand): Promise<ManagerCreditTopupOrderView>;
}

export const CREDIT_QUERY_REPOSITORY = Symbol("CREDIT_QUERY_REPOSITORY");

export interface CreditQueryRepository {
  assertManagerAccess(userId: string): Promise<void>;
  getAccount(managerId: string): Promise<ManagerCreditAccountView>;
  getWorkspace(managerId: string, page?: { cursor?: string; limit?: number }): Promise<ManagerCreditWorkspace>;
  getTopupOrder(managerId: string, orderId: string): Promise<ManagerCreditTopupOrderView>;
}
```

Define the internal command shapes exactly as follows:

```ts
export type CreateTopupOrderCommand = Readonly<{
  managerId: string; amount: number; creationKey: string; returnPath: string;
}>;
export type CreateTopupOrderResult = Readonly<{ order: ManagerCreditTopupOrderView }>;
export type ClaimTopupConfirmationCommand = Readonly<{
  managerId: string; orderId: string; paymentKey: string; amount: number;
}>;
export type TopupConfirmationClaim =
  | { outcome: "CLAIMED"; order: ManagerCreditTopupOrderView }
  | { outcome: "ALREADY_APPROVED"; order: ManagerCreditTopupOrderView }
  | { outcome: "IN_PROGRESS"; order: ManagerCreditTopupOrderView }
  | { outcome: "RECONCILIATION_REQUIRED"; order: ManagerCreditTopupOrderView };
export type FinalizeTopupCommand = Readonly<{
  managerId: string; orderId: string; payment: TossPaymentSnapshot;
}>;
export type FinalizeTopupResult = Readonly<{
  order: ManagerCreditTopupOrderView; ledgerEntryId: string;
}>;
export type MarkTopupRejectedCommand = Readonly<{
  managerId: string; orderId: string; reason: string;
}>;
export type MarkTopupUncertainCommand = Readonly<{
  managerId: string; orderId: string; reason: string;
}>;
export type CancelReadyTopupCommand = Readonly<{ managerId: string; orderId: string }>;
```

Mutation methods return discriminated results rather than throwing inside a transaction when an insufficient/failed attempt must remain committed.

- [ ] **Step 4: Implement topup transactions and direct query mapping**

`ensureAccount` idempotently creates a zero-balance account plus default `ALWAYS_REQUIRE_APPROVAL` policy without an OPENING ledger; only the explicit demo seed may create OPENING_BALANCE. `createTopupOrder` calls the same transaction helper, checks `creationKey`, validates the server-normalized return path, and creates READY exactly once. Account/workspace service reads call `ensureAccount` before the direct query so a new manager's header is backed by a real DB row rather than a fabricated DTO.

`assertManagerAccess` directly verifies an ACTIVE UserAccount and either a legacy LANDLORD role or an owned Room in PostgreSQL. It does not inspect `RoomlogStore`.

`claimTopupConfirmation` uses a single conditional update:

```ts
const claimed = await tx.creditTopupOrder.updateMany({
  where: { managerId, orderId, status: "READY", amount: BigInt(amount) },
  data: { status: "CONFIRMING", paymentKey }
});
```

Only `claimed.count === 1` returns `CLAIMED`. Re-read the row to classify every losing result without calling Toss.

`finalizeTopup` runs at `Serializable`, revalidates manager/order/paymentKey/amount and DONE status, then in one transaction:

1. Increment account balance.
2. Insert one TOPUP ledger with `idempotencyKey = topup:${orderId}` and returned `balanceAfter`.
3. Change order to APPROVED with method and approvedAt.
4. Insert outbox event `credit-topup:${orderId}:approved`.

An existing APPROVED order returns its original result. Any mismatch raises a conflict without changing account or ledger. Query mapping must throw if a DB bigint exceeds `Number.MAX_SAFE_INTEGER` instead of silently rounding.

`markTopupRejected` changes only CONFIRMING/RECONCILIATION_REQUIRED to FAILED, stores a bounded deterministic reason, and inserts `credit-topup:${orderId}:failed` in the same transaction. `markTopupUncertain` never emits a failure event, and `cancelReadyTopup` changes only READY to CANCELLED.

- [ ] **Step 5: Run repository GREEN and constraint probes**

Run: `ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/prisma-credit-command.repository.spec.ts`

Expected: PASS for creation-key idempotency, one CAS winner, one ledger, balance equality, CHECK rejection, and direct read projection.

- [ ] **Step 6: Commit the direct DB boundary**

```bash
git add apps/api/src/credit/credit-prisma.client.ts apps/api/src/credit/credit-command.repository.ts apps/api/src/credit/credit-query.repository.ts apps/api/src/credit/prisma-credit-command.repository.ts apps/api/src/credit/prisma-credit-query.repository.ts apps/api/src/credit/prisma-credit-command.repository.spec.ts
git commit -m "feat: add atomic credit topup repository"
```

### Task 4: Topup Service, Reconciliation, Controller, and Module

- [ ] **Task 4 완료 조건:** only a successful CAS winner calls Toss, uncertain outcomes reconcile by order lookup, routes derive manager identity from auth, and `CreditService` is exported.

**Files:**
- Create: `apps/api/src/auth/bearer-token.ts`
- Create: `apps/api/src/auth/bearer-token.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-auth.domain.ts:318-350`
- Create: `apps/api/src/credit/credit.service.ts`
- Create: `apps/api/src/credit/credit.service.spec.ts`
- Create: `apps/api/src/credit/credit.controller.ts`
- Create: `apps/api/src/credit/credit.module.ts`
- Create: `apps/api/src/credit/credit-module-wiring.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: Tasks 2-3 gateway/repositories; existing `tokenSecret` and UserAccount/Room DB rows.
- Produces: `requireBearerSubject`, manager credit REST routes, and exported `CreditService` without a CreditModule→RoomlogModule dependency.

- [ ] **Step 1: Write service RED tests with fakes**

Cover exact orchestration outcomes:

```ts
it("calls Toss once when two confirms race", async () => {
  repository.claimResults.push({ outcome: "CLAIMED", order }, { outcome: "IN_PROGRESS", order });
  const results = await Promise.all([
    service.confirmTopup(managerId, orderId, { paymentKey, amount: 500_000 }),
    service.confirmTopup(managerId, orderId, { paymentKey, amount: 500_000 })
  ]);
  assert.equal(gateway.confirmCalls.length, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ["APPROVED", "CONFIRMING"]);
});
```

Also test DECLINED → FAILED, UNKNOWN → RECONCILIATION_REQUIRED, successful Toss + local finalize error → uncertain marker, lookup DONE → finalize, lookup ABORTED/EXPIRED → FAILED, lookup nonterminal → reconciliation remains, and already-approved confirm makes no gateway call.

In `bearer-token.spec.ts`, generate a token with existing `tokenFor`, assert the extracted subject, and assert missing token, malformed payload, bad signature, and invalid JSON all produce the same unauthorized result without leaking parsing details.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter api exec node --test -r ts-node/register src/credit/credit.service.spec.ts src/auth/bearer-token.spec.ts`

Expected: FAIL because `CreditService` and the shared bearer verifier are missing.

- [ ] **Step 3: Implement topup orchestration outside transactions**

```ts
export class CreditService {
  async requireManager(authorization?: string): Promise<string>;
  async createTopupOrder(managerId: string, input: CreateManagerCreditTopupInput): Promise<ManagerCreditTopupCheckout>;
  async confirmTopup(managerId: string, orderId: string, input: ConfirmManagerCreditTopupInput): Promise<ManagerCreditTopupOrderView>;
  async reconcileTopup(managerId: string, orderId: string): Promise<ManagerCreditTopupOrderView>;
  async cancelTopup(managerId: string, orderId: string): Promise<ManagerCreditTopupOrderView>;
  async getAccount(managerId: string): Promise<ManagerCreditAccountView>;
  async getWorkspace(managerId: string, page?: { cursor?: string; limit?: number }): Promise<ManagerCreditWorkspace>;
}
```

`requireManager` calls the shared pure bearer verifier, then awaits `CreditQueryRepository.assertManagerAccess(subject)` and returns that subject as managerId. Extract bearer HMAC parsing from `RoomlogAuthDomain.getUserFromToken` into `apps/api/src/auth/bearer-token.ts`; both legacy auth and Credit must call the same function so token acceptance cannot drift.

The confirm algorithm is exact:

1. Claim READY with repository CAS.
2. Return immediately for APPROVED, IN_PROGRESS, or RECONCILIATION_REQUIRED loser results.
3. Call `gateway.confirmPayment` only for CLAIMED.
4. Verify returned orderId, paymentKey, amount, and DONE status.
5. Await `finalizeTopup`.
6. On `DECLINED`, await `markTopupRejected`. On `UNKNOWN` or local finalize failure, best-effort await `markTopupUncertain`; return the persisted RECONCILIATION_REQUIRED order when that write succeeds, otherwise throw 503 while the durable stale CONFIRMING row remains reconcilable.

Reconcile reads the local order, calls `getPaymentByOrderId(orderId)` only for stale CONFIRMING or RECONCILIATION_REQUIRED, and routes DONE through the same `finalizeTopup` method. It never calls Toss confirm again.

- [ ] **Step 4: Add authenticated routes and provider wiring**

Implement:

```text
GET    /manager/credits/account
GET    /manager/credits
POST   /manager/credits/topup-orders
GET    /manager/credits/topup-orders/:orderId
POST   /manager/credits/topup-orders/:orderId/confirm
POST   /manager/credits/topup-orders/:orderId/reconcile
POST   /manager/credits/topup-orders/:orderId/cancel
```

Every controller method calls `creditService.requireManager(authorization)` and never reads managerId from request input. `CreditModule` imports `DomainEventsModule`, owns `CreditController`, one `CreditPrismaClient`, command/query repositories, Toss gateway, and `CreditService`, and exports only `CreditService`; it must not import `RoomlogModule`. `DomainEventsModule` imports only `RealtimeModule` and exports the transaction-aware event repository plus notification dispatcher. At this topup-only checkpoint, register `CreditModule` directly in `AppModule` and leave workflow's deferred completion boundary unchanged. Task 5 moves the import under `RoomlogModule` only after `evaluateAfterCompletion` exists.

Add `credit-module-wiring.spec.ts` using `NestFactory.createApplicationContext(AppModule, { logger: false })`, assert `CreditService`, `DOMAIN_EVENT_REPOSITORY`, and `DomainEventDispatcher` resolve once, then `await app.close()`. Run it with both DB environment variables mapped to the docker test DB so `createRoomlogServiceOptions()` cannot accidentally use a developer database.

- [ ] **Step 5: Run GREEN and build**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/credit/credit.service.spec.ts
pnpm --filter api exec node --test -r ts-node/register src/auth/bearer-token.spec.ts
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/credit-module-wiring.spec.ts
pnpm --filter api build
```

Expected: service tests PASS and Nest resolves the Credit module without a circular dependency.

- [ ] **Step 6: Commit the topup API slice**

```bash
git add apps/api/src/auth/bearer-token.ts apps/api/src/auth/bearer-token.spec.ts apps/api/src/roomlog/services/roomlog-auth.domain.ts apps/api/src/credit/credit.service.ts apps/api/src/credit/credit.service.spec.ts apps/api/src/credit/credit.controller.ts apps/api/src/credit/credit.module.ts apps/api/src/credit/credit-module-wiring.spec.ts apps/api/src/app.module.ts
git commit -m "feat: expose reconciled credit topups"
```

### Task 5: Policy Evaluation, Durable Backlog Drain, and Atomic Settlement

- [ ] **Task 5 완료 조건:** completion approval evaluates once, all settlement modes contend on one request row, insufficient attempts persist, and Cost/audit/outbox are in the same transaction.

**Files:**
- Modify: `apps/api/src/credit/credit-command.repository.ts`
- Modify: `apps/api/src/credit/prisma-credit-command.repository.ts`
- Modify: `apps/api/src/credit/credit.service.ts`
- Modify: `apps/api/src/credit/credit.controller.ts`
- Modify: `apps/api/src/credit/credit.module.ts`
- Create: `apps/api/src/credit/prisma-credit-settlement.spec.ts`
- Modify: `apps/api/src/credit/credit.service.spec.ts`
- Create: `apps/api/src/roomlog/credit-vendor-completion.adapter.ts`
- Create: `apps/api/src/roomlog/credit-vendor-completion.adapter.spec.ts`
- Modify: `apps/api/src/roomlog/completion-credit-delivery.worker.spec.ts`
- Modify: `apps/api/src/credit/credit-module-wiring.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: workflow-owned committed `VendorPaymentRequest` and `RepairCompletionDecision`.
- Produces: READY implementation of the workflow boundary, deferred-backlog drain through the existing worker, policy and settlement endpoints.

```ts
export type SaveAutoPayPolicyCommand = Readonly<{
  managerId: string; mode: AutoPayPolicyMode; perRequestLimit?: number;
}>;
export type EvaluateAfterCompletionCommand = Readonly<{
  managerId: string; paymentRequestId: string; completionDecisionId: string; actorUserId: string;
}>;
export type EvaluateAfterCompletionResult =
  | { outcome: "AUTO_PAID"; paymentRequestId: string; ledgerEntryId: string }
  | { outcome: "PENDING_APPROVAL" | "INSUFFICIENT_CREDIT"; paymentRequestId: string }
  | {
      outcome: "ALREADY_FINAL";
      paymentRequestId: string;
      status: "AUTO_PAID" | "MANUAL_CREDIT_PAID" | "DIRECT_PAID" | "CANCELLED" | "REVERSED" | "DIRECT_PAYMENT_VOIDED";
    };
export type SettlePaymentRequestCommand = Readonly<{
  managerId: string;
  paymentRequestId: string;
  mode: "AUTO_CREDIT" | "MANUAL_CREDIT" | "DIRECT";
  idempotencyKey: string;
  actorUserId: string;
  completionDecisionId?: string;
}>;
export type SettlePaymentRequestResult =
  | { outcome: "PAID"; request: ManagerVendorPaymentRequestView; ledgerEntryId?: string }
  | { outcome: "INSUFFICIENT_CREDIT"; request: ManagerVendorPaymentRequestView }
  | { outcome: "ALREADY_FINAL"; request: ManagerVendorPaymentRequestView };

export interface CreditCommandRepository {
  saveAutoPayPolicy(input: SaveAutoPayPolicyCommand): Promise<ManagerAutoPayPolicyView>;
  evaluateAfterCompletion(input: EvaluateAfterCompletionCommand): Promise<EvaluateAfterCompletionResult>;
  settlePaymentRequest(input: SettlePaymentRequestCommand): Promise<SettlePaymentRequestResult>;
}

export type EvaluateAfterCompletionInput = EvaluateAfterCompletionCommand;
export type { EvaluateAfterCompletionResult } from "./credit-command.repository";
```

- [ ] **Step 1: Write settlement RED tests**

Create real-Postgres fixtures containing manager, repair, LANDLORD cost bearer, approved estimate, latest completion report, manager APPROVED decision, and WAITING_COMPLETION request. Test:

- `ALWAYS_REQUIRE_APPROVAL` → PENDING_APPROVAL without ledger.
- AUTO policy within limit and sufficient balance → AUTO_PAID with one debit.
- over limit → PENDING_APPROVAL.
- insufficient balance → persisted INSUFFICIENT_CREDIT request and attempt, no ledger/Cost.
- TENANT/PENDING burden, stale report decision, LEGACY_MIGRATION decision, estimate ID/amount mismatch → integrity error and no state change.
- explicit MANUAL_CREDIT from PENDING_APPROVAL/INSUFFICIENT_CREDIT succeeds and clears failureReason.
- DIRECT succeeds with no credit ledger.
- auto vs direct and manual vs direct races produce exactly one SUCCEEDED attempt.
- two different requests contending for one sufficient balance produce one success and no negative balance.
- a workflow-created pending `CREDIT_EVALUATION` delivery drains after the READY adapter starts, without a new completion decision.
- boundary exception reschedules delivery; credit commit followed by a simulated crash before `markDelivered` replays as `ALREADY_FINAL` with one attempt/debit/Cost/audit/outbox event.
- `PENDING_APPROVAL` and `INSUFFICIENT_CREDIT` replay complete delivery without duplicating audit/outbox; insufficient replay has one attempt and no ledger/Cost.

- [ ] **Step 2: Run RED**

Run: `ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/prisma-credit-settlement.spec.ts`

Expected: FAIL because policy/settlement repository methods are not implemented.

- [ ] **Step 3: Implement validation and row serialization**

Inside one `Serializable` transaction, lock the request before choosing a path:

```ts
await tx.$queryRaw`
  SELECT "id"
  FROM "VendorPaymentRequest"
  WHERE "id" = ${paymentRequestId} AND "managerId" = ${managerId}
  FOR UPDATE
`;
```

Then re-read relations and require all of:

1. Request belongs to manager; automatic evaluation may enter only from `WAITING_COMPLETION`, while explicit manual/direct settlement may enter only from `PENDING_APPROVAL` or `INSUFFICIENT_CREDIT`. A replay of the same completion decision may return the already-persisted outcome/final state but may not reopen a cancelled/reversed/voided request.
2. Request completionReportId is the latest report for the repair.
3. Supplied decision belongs to that report, is `source=MANAGER`, `decision=APPROVED`, and manager matches.
4. Repair costBearer is LANDLORD.
5. Current approved estimate ID equals request approvedEstimateId and its amount equals request amount.
6. Amount is an integer in `1..2_147_483_647`, because credit uses `BIGINT` but existing PostgreSQL/Prisma `Cost.amount` is a 32-bit `Int`.

Pin `completionDecisionId` in this transaction. Default missing policy to `ALWAYS_REQUIRE_APPROVAL` without coupling policy presence to balance.

- [ ] **Step 4: Implement the three settlement outcomes**

For AUTO/MANUAL credit, atomically decrement with a balance guard:

```sql
UPDATE "CreditAccount"
SET "balance" = "balance" - $1, "updatedAt" = NOW()
WHERE "managerId" = $2 AND "balance" >= $1
RETURNING "id", "balance";
```

When no row returns, create/update the attempt as INSUFFICIENT_CREDIT, transition request accordingly, append audit/outbox, return a discriminated insufficient result, and let the transaction commit. The service converts that result to the API response after commit.

On credit success, create the negative AUTO_DEBIT or MANUAL_DEBIT ledger, SUCCEEDED attempt, final request state, and one deterministic Cost. Load the repair, latest completion report, ticket, and room inside the transaction; assert `request.managerId === ticket.room.landlordId`; normalize `unitId = room.roomNo.trim().replace(/호$/u, "")`; then write every required existing Cost field:

```ts
const financialCost = {
  id: `cost_vendor_payment_${request.id}`,
  managerId: request.managerId,
  date: request.completionReport.completedAt,
  item: `${unitId} ${request.repair.title}`,
  amount: Number(request.amount),
  type: "REPAIR" as const,
  scope: "UNIT" as const,
  unitId,
  status: "CONFIRMED" as const,
  verified: true,
  repairPayment: "ALREADY_PAID" as const,
  paymentRef: request.repairId,
  createdAt: now,
  updatedAt: now
};
```

Set `VendorPaymentRequest.costId`, optional `ledgerEntryId`, and `processedAt` in that same transaction. For DIRECT, create the same deterministic Cost/request/attempt/audit/event+`NOTIFICATION` delivery without touching account or ledger. Stable idempotency keys are caller-provided for manual/direct and `auto:${paymentRequestId}:${completionDecisionId}` for auto. Every audit uses a deterministic `dedupeKey`; a reused key with different request/mode/payload is a conflict.

- [ ] **Step 5: Wire service policy and settlement methods**

```ts
async evaluateAfterCompletion(input: EvaluateAfterCompletionInput): Promise<EvaluateAfterCompletionResult>;
async updateAutoPayPolicy(managerId: string, input: UpdateAutoPayPolicyInput): Promise<ManagerAutoPayPolicyView>;
async settlePaymentRequest(
  managerId: string,
  paymentRequestId: string,
  actorUserId: string,
  input: SettleVendorPaymentRequestInput
): Promise<ManagerVendorPaymentRequestView>;
```

Validate `AUTO_DEBIT_UNDER_LIMIT` requires positive safe-integer `perRequestLimit`; `ALWAYS_REQUIRE_APPROVAL` rejects a supplied limit. Controller actorUserId and managerId both come from the authenticated user.

Add `PATCH /manager/credits/auto-pay-policy` and `POST /manager/vendor-payment-requests/:id/settle` in this task. The settle body accepts only `MANUAL_CREDIT | DIRECT`; AUTO_CREDIT is internal to `evaluateAfterCompletion` and is never client-selectable.

- [ ] **Step 6: Replace the deferred boundary and drain durable credit deliveries without a module cycle**

Create `CreditVendorCompletionAdapter` in the Roomlog side of the dependency seam:

```ts
export class CreditVendorCompletionAdapter implements VendorCompletionCreditBoundary {
  readonly availability = "READY" as const;
  constructor(private readonly credit: CreditService) {}

  evaluateAfterCompletion(input: EvaluateAfterCompletionInput) {
    return this.credit.evaluateAfterCompletion(input);
  }
}
```

Add an adapter spec that proves the exact manager/request/decision/actor IDs are forwarded and the adapter advertises `READY`. Keep the workflow-owned `CompletionCreditDeliveryWorker`; do not call Credit directly from the completion HTTP request. Change `RoomlogModule` to import both `DomainEventsModule` and `CreditModule`, replace only `{ useClass: DeferredVendorCompletionCreditBoundary }` with the READY adapter, and let worker bootstrap immediately claim the existing backlog. Remove the direct `CreditModule` import from `AppModule`; it remains reachable exactly once through `RoomlogModule`.

The module direction is fixed: `RoomlogModule -> CreditModule -> DomainEventsModule -> RealtimeModule`, with an additional `RoomlogModule -> DomainEventsModule` edge. `CreditModule` explicitly imports `DomainEventsModule` so settlement/topup transactions can call `DOMAIN_EVENT_REPOSITORY.enqueue(tx, ...)`, exports `CreditService`, and imports no Roomlog provider. `DomainEventsModule` imports neither Credit nor Roomlog. Extend `credit-module-wiring.spec.ts` to create a real application context, assert one READY boundary/worker and all tokens resolve, close it, and prove no circular dependency.

The worker test stages a credit delivery before replacing the provider, asserts it remains `PENDING`, restarts with the READY adapter, calls `dispatchPending`, and asserts it becomes `DELIVERED`. Add injected crash points after Credit commit/before delivery CAS; a second dispatch must return the persisted `PENDING_APPROVAL`, `INSUFFICIENT_CREDIT`, `AUTO_PAID`, or `ALREADY_FINAL` result without another audit, event, attempt, ledger, balance change, or Cost.

- [ ] **Step 7: Run settlement and module GREEN**

Run:

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/prisma-credit-settlement.spec.ts
pnpm --filter api exec node --test -r ts-node/register src/credit/credit.service.spec.ts
pnpm --filter api exec node --test -r ts-node/register src/roomlog/credit-vendor-completion.adapter.spec.ts
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/roomlog/completion-credit-delivery.worker.spec.ts src/credit/credit-module-wiring.spec.ts
pnpm --filter api build
```

Expected: every policy branch and both concurrency races PASS, account balance equals ledger sum, deferred backlog drains, crash/replay is idempotent, and Nest resolves `Roomlog -> Credit -> DomainEvents -> Realtime` without a cycle.

- [ ] **Step 8: Commit settlement atomics and the real workflow boundary**

```bash
git add apps/api/src/credit/credit-command.repository.ts apps/api/src/credit/prisma-credit-command.repository.ts apps/api/src/credit/credit.service.ts apps/api/src/credit/credit.controller.ts apps/api/src/credit/credit.module.ts apps/api/src/credit/prisma-credit-settlement.spec.ts apps/api/src/credit/credit.service.spec.ts apps/api/src/roomlog/credit-vendor-completion.adapter.ts apps/api/src/roomlog/credit-vendor-completion.adapter.spec.ts apps/api/src/roomlog/completion-credit-delivery.worker.spec.ts apps/api/src/credit/credit-module-wiring.spec.ts apps/api/src/roomlog/roomlog.module.ts apps/api/src/app.module.ts
git commit -m "feat: settle vendor payments atomically"
```

### Task 6: Reversal, Direct Void, and Stale Cost Projector Protection

- [ ] **Task 6 완료 조건:** cancellation is append-only/final, existing Cost views read committed finance truth, and stale Store projection cannot overwrite a finance-owned Cost.

**Files:**
- Modify: `apps/api/src/credit/credit-command.repository.ts`
- Modify: `apps/api/src/credit/prisma-credit-command.repository.ts`
- Modify: `apps/api/src/credit/credit.service.ts`
- Modify: `apps/api/src/credit/credit.controller.ts`
- Create: `apps/api/src/roomlog/services/prisma-financial-cost.reader.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-cost.domain.ts:19-325`
- Modify: `apps/api/src/roomlog/roomlog.service.ts` Cost wrapper methods and `RoomlogServiceOptions`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts` where async Cost/deposit wrappers are awaited
- Modify: `apps/api/src/roomlog/roomlog.module.ts:11-34`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts:1896-1938`
- Create: `apps/api/src/credit/credit-reversal-cost-boundary.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts:5377-5555`

**Interfaces:**
- Consumes: successful payment request with linked Cost and optional debit ledger.
- Produces: final REVERSED/DIRECT_PAYMENT_VOIDED request and finance Cost read overlay.

```ts
export type ReverseCreditPaymentCommand = Readonly<{
  managerId: string;
  paymentRequestId: string;
  actorUserId: string;
  idempotencyKey: string;
  note: string;
}>;
export type VoidDirectPaymentCommand = ReverseCreditPaymentCommand;
export type CancelPaymentRequestCommand = ReverseCreditPaymentCommand;

export interface CreditCommandRepository {
  reverseCreditPayment(input: ReverseCreditPaymentCommand): Promise<ManagerVendorPaymentRequestView>;
  voidDirectPayment(input: VoidDirectPaymentCommand): Promise<ManagerVendorPaymentRequestView>;
  cancelPaymentRequest(input: CancelPaymentRequestCommand): Promise<ManagerVendorPaymentRequestView>;
}
```

- [ ] **Step 1: Write reversal and stale-projector RED tests**

Test exact invariants:

```ts
await Promise.allSettled([
  repository.reverseCreditPayment({ managerId, paymentRequestId, actorUserId, idempotencyKey: "reverse-a", note: "중복 지급 정정" }),
  repository.reverseCreditPayment({ managerId, paymentRequestId, actorUserId, idempotencyKey: "reverse-b", note: "중복 지급 정정" })
]);
assert.equal(await prisma.creditLedgerEntry.count({ where: { type: "REVERSAL", referenceId: paymentRequestId } }), 1);
assert.equal((await prisma.vendorPaymentRequest.findUniqueOrThrow({ where: { id: paymentRequestId } })).status, "REVERSED");
assert.equal((await prisma.cost.findUniqueOrThrow({ where: { id: costId } })).status, "VOID");
```

Also project (a) a stale Store Cost with the same finance-owned ID and `UNPAID` and (b) a different synthetic ID `cost_repair_<repairId>` with the same `paymentRef`; run `PrismaStoreProjector.persist` and assert DB remains one authoritative `ALREADY_PAID` row. Repeat after reversal and prove a linked `VOID` finance row still suppresses synthetic `UNPAID` regeneration. Verify list/detail/monthly/deposit-related Cost reads contain one authoritative row, direct void creates no ledger, post-approval cancellation creates no Cost/ledger, and every cancellation state is final.

- [ ] **Step 2: Run RED**

Run: `ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/credit-reversal-cost-boundary.spec.ts`

Expected: FAIL because reversal and authoritative Cost overlay are absent.

- [ ] **Step 3: Implement reversal and direct void transactions**

Credit reversal must lock the paid request, load its original AUTO/MANUAL debit, require the same account, insert exactly one positive REVERSAL with `reversesLedgerEntryId`, increment balance, set request REVERSED, set linked Cost VOID with a non-empty reason, append CREDIT_REVERSED audit/outbox, and commit once. The DB trigger and unique `reversesLedgerEntryId` are the final duplicate guard.

Direct void must lock a DIRECT_PAID request, create no ledger, set request DIRECT_PAYMENT_VOIDED, set Cost VOID, and append DIRECT_PAYMENT_VOIDED audit/outbox in one transaction. Both final states return idempotently for the same key and reject payment attempts after cancellation.

Payment cancellation must lock only `PENDING_APPROVAL` or `INSUFFICIENT_CREDIT`, create no ledger/Cost, set request CANCELLED, and append a deduplicated CANCELLED audit/event+notification delivery. `WAITING_COMPLETION` is workflow completion-review state: the manager uses completion rejection there, and this Credit API must reject it. Cancellation is final and cannot cancel a paid request.

Reversal, direct void, and cancellation first claim `VendorPaymentCommandReceipt` with canonical payload hash. Same key/same payload returns the persisted result; same key/different payload is `409`; concurrent different keys still serialize on the payment request and only one valid final command wins. This receipt is required even for direct void/cancel because those commands may create no ledger row.

Add `POST /manager/vendor-payment-requests/:id/reverse-credit`, `POST /manager/vendor-payment-requests/:id/void-direct`, and `POST /manager/vendor-payment-requests/:id/cancel` in this task. All derive managerId and actorUserId from the authenticated subject and require a non-empty note plus idempotencyKey.

- [ ] **Step 4: Protect and overlay finance-owned Cost rows**

Before projector Cost upserts, load all settled links `{ costId, repairId }` in the same Prisma transaction. Skip a Store Cost when its ID is finance-owned **or** its non-null `paymentRef` matches a finance-owned repair. In projector `load()`, exclude Costs linked by `VendorPaymentRequest.costId` so finance rows are supplied only by the direct overlay; do not copy them into `RoomlogStore` as a financial source.

`PrismaFinancialCostReader` directly queries all Costs linked by `VendorPaymentRequest.costId`, including `VOID`. Provide a no-op reader for no-DB/unit-test construction. Make RoomlogService Cost list/detail/monthly wrappers and the synchronous `listManagerBillDeposits` caller async, load this overlay, and pass it to pure `RoomlogCostDomain` merge/summary functions; update controller awaits and affected tests. Merge by Cost ID and suppress any stored/synthetic row whose `paymentRef` matches an authoritative repair, even when the authoritative row is VOID. Legacy Cost confirm/update/void mutations remain Store-owned and must reject a finance-owned ID; only Credit reversal/void can mutate it.

- [ ] **Step 5: Run GREEN and regression tests**

Run:

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/credit-reversal-cost-boundary.spec.ts
pnpm --filter api exec node --test -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: one reversal under concurrency, Cost stays authoritative after stale persist, Cost summaries reflect paid/void state, and existing repair projection tests pass.

- [ ] **Step 6: Commit the accounting correction boundary**

```bash
git add apps/api/src/credit/credit-command.repository.ts apps/api/src/credit/prisma-credit-command.repository.ts apps/api/src/credit/credit.service.ts apps/api/src/credit/credit.controller.ts apps/api/src/roomlog/services/prisma-financial-cost.reader.ts apps/api/src/roomlog/services/roomlog-cost.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.module.ts apps/api/src/roomlog/prisma-store-projector.ts apps/api/src/credit/credit-reversal-cost-boundary.spec.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "fix: protect credit-owned cost records"
```

### Task 7: Web Credit API, Demo Read Fallback, Return Paths, and Toss Helper

- [ ] **Task 7 완료 조건:** GETs render with demo data when API is down, every mutation hard-fails, return paths cannot escape `/manager`, and tenant plus credit UI share one Toss SDK helper.

**Files:**
- Create: `apps/web/src/lib/demo-vendor-credit.ts`
- Create: `apps/web/src/lib/vendor-credit-api.ts`
- Create: `apps/web/src/lib/credit-return-path.ts`
- Create: `apps/web/src/lib/credit-return-path.spec.ts`
- Create: `apps/web/src/lib/toss-payments.ts`
- Modify: `apps/web/src/app/tenant/payment/02/PaymentReportForm.tsx:38-101,270-322,358`
- Modify: `docker-compose.prod.yml:3-18`

**Interfaces:**
- Consumes: Task 4 REST routes and existing `serverFetch` authentication forwarding.
- Produces: server API functions, safe redirect utility, client-safe Toss helper, 480,000 demo projection.

- [ ] **Step 1: Write return-path and fallback RED tests**

```ts
assert.equal(normalizeManagerReturnPath("/manager/home?tab=open"), "/manager/home?tab=open");
assert.equal(normalizeManagerReturnPath("https://evil.example/manager"), "/manager/vendor-mgmt/credit");
assert.equal(normalizeManagerReturnPath("//evil.example/manager"), "/manager/vendor-mgmt/credit");
assert.equal(normalizeManagerReturnPath("/tenant/payment"), "/manager/vendor-mgmt/credit");
```

Add a source contract assertion that `createManagerCreditTopup`, `confirmManagerCreditTopup`, `updateManagerAutoPayPolicy`, `settleVendorPaymentRequest`, `reverseVendorCreditPayment`, `voidVendorDirectPayment`, and `cancelVendorPaymentRequest` call `serverFetch` directly and never return demo mutation results.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/credit-return-path.spec.ts`

Expected: FAIL because the utility and API client are missing.

- [ ] **Step 3: Implement safe reads and hard-fail mutations**

`demo-vendor-credit.ts` must expose opening +100,000, topup +500,000, auto debit -120,000, final balance 480,000, and matching `balanceAfter` values. `getManagerCreditAccount` and `getManagerCreditWorkspace` may catch read errors and return this projection. No mutation function may contain a catch that returns demo success.

```ts
export const normalizeManagerReturnPath = (
  value: string | null | undefined,
  fallback = "/manager/vendor-mgmt/credit"
): string => {
  if (!value || !value.startsWith("/manager") || value.startsWith("//")) return fallback;
  const parsed = new URL(value, "https://roomlog.invalid");
  if (parsed.origin !== "https://roomlog.invalid" || !parsed.pathname.startsWith("/manager")) return fallback;
  parsed.searchParams.delete("creditTopup");
  parsed.searchParams.delete("creditTopupOrderId");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
```

All mutation inputs carry `creationKey`/`idempotencyKey` in JSON bodies, so the current wildcard BFF need not forward a custom header.

- [ ] **Step 4: Extract the Toss SDK helper and production env wiring**

Move the `window.TossPayments` types, `_gck_` widget-mode detection, SDK script URL, and payment-window/widget request branching from `PaymentReportForm.tsx` into `toss-payments.ts`. Keep tenant behavior unchanged and export a manager-card request helper that accepts orderId, amount, orderName, customerKey, successUrl, and failUrl.

Add `NEXT_PUBLIC_TOSS_CLIENT_KEY` as both build arg and runtime environment in `docker-compose.prod.yml`, matching local compose. Never expose `TOSS_SECRET_KEY` to web.

- [ ] **Step 5: Run GREEN and web build**

Run:

```bash
pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/credit-return-path.spec.ts
pnpm --filter web build
```

Expected: utility/API contract tests PASS; tenant payment form still compiles.

- [ ] **Step 6: Commit the web boundary**

```bash
git add apps/web/src/lib/demo-vendor-credit.ts apps/web/src/lib/vendor-credit-api.ts apps/web/src/lib/credit-return-path.ts apps/web/src/lib/credit-return-path.spec.ts apps/web/src/lib/toss-payments.ts apps/web/src/app/tenant/payment/02/PaymentReportForm.tsx docker-compose.prod.yml
git commit -m "feat: add safe web credit payment client"
```

### Task 8: Global Manager Header Utility, Topup Modal, and Redirect Callbacks

- [ ] **Task 8 완료 조건:** every desktop ManagerAppShell page shows credit balance + modal, call/vox remain excluded, Toss returns to the stored original path, and failed mutations remain visibly failed.

**Files:**
- Create: `apps/web/src/app/manager/_components/ManagerCreditUtility.tsx`
- Create: `apps/web/src/app/manager/_components/ManagerCreditUtility.module.css`
- Create: `apps/web/src/lib/vendor-credit-events.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerAppShell.tsx:31-128`
- Create: `apps/web/src/app/manager/credit-topup/success/page.tsx`
- Create: `apps/web/src/app/manager/credit-topup/fail/page.tsx`
- Create: `apps/web/src/app/manager/manager-credit-shell.spec.ts`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts:33-172`

**Interfaces:**
- Consumes: Task 7 client/server API and Toss helper.
- Produces: `ManagerCreditUtility`, success/fail callback contract, refreshed shell balance.

- [ ] **Step 1: Write shell/modal/callback RED source contracts**

Assert:

- `ManagerAppShell` imports and renders `ManagerCreditUtility` inside `headerActions` beside the existing mobile menu action.
- all existing desktop shell source paths still use `ManagerAppShell`.
- `manager/ticket/call/layout.tsx` and `manager/vox/layout.tsx` remain PhoneFrame-only and do not import the utility.
- modal contains 100000, 300000, 500000, 1000000 and labels 현재 잔액, 충전 후 예상 잔액, 취소, 결제 진행.
- callback pages confirm/cancel through server functions and redirect with the order's stored returnPath, not a query-supplied URL.
- CSS contains `var(--` and no hex color literal.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/manager-credit-shell.spec.ts`

Expected: FAIL because the utility and callbacks are missing.

- [ ] **Step 3: Implement the formal header utility and modal**

`ManagerCreditUtility` must:

1. GET account on mount; use 480,000 demo only when the read fails.
2. Link the balance label to `/manager/vendor-mgmt/credit`.
3. Open an in-app `role="dialog"` modal from 충전.
4. Validate quick/direct amount as a positive safe integer.
5. Show projected balance without mutating current balance.
6. Generate `creationKey` with `crypto.randomUUID()` once per checkout attempt.
7. POST the topup order with `window.location.pathname + window.location.search` as returnPath.
8. Invoke Toss only after the server returns orderId/clientKey/customerKey.
9. Display API/Toss errors in the modal and never increment balance locally.
10. On `creditTopup=approved` callback marker, refetch account, show success, and remove callback query keys with `history.replaceState`.

Export `OPEN_MANAGER_CREDIT_TOPUP_EVENT = "roomlog:open-manager-credit-topup"` and `openManagerCreditTopup()` from `vendor-credit-events.ts`. `ManagerCreditUtility` listens for that window event and removes the listener on unmount; the workspace button uses the exported dispatcher instead of duplicating modal state.

Use only token CSS such as:

```css
.utility {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.dialogPanel {
  background: var(--surface-container-lowest);
  color: var(--on-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  padding: var(--space-xl);
}
```

Compose `headerActions` as utility plus the existing action. Do not position the utility fixed/floating and do not change `packages/ui/src/components/ManagerShell.tsx`.

- [ ] **Step 4: Implement server callback pages**

Success callback requires paymentKey/orderId/amount, calls the hard-fail confirm API, then redirects to `normalizeManagerReturnPath(order.returnPath)` with `creditTopup=approved` and order ID. If confirm returns CONFIRMING or RECONCILIATION_REQUIRED, redirect with `creditTopup=reconciliation_required`; if it throws, redirect to the stored order path with `creditTopup=failed` only after fetching that order from the authenticated API.

Fail callback fetches the server order, calls cancel only when it is READY, and redirects to its stored returnPath with `creditTopup=cancelled`. It must never trust a `returnPath` search parameter.

- [ ] **Step 5: Run GREEN and workspace shell regressions**

Run:

```bash
pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/manager-credit-shell.spec.ts src/app/manager/manager-workspace-shell.spec.ts
pnpm --filter web build
```

Expected: shell contracts PASS; call/vox exclusions remain; Next server/client boundaries compile.

- [ ] **Step 6: Commit the global utility**

```bash
git add apps/web/src/lib/vendor-credit-events.ts apps/web/src/app/manager/_components/ManagerCreditUtility.tsx apps/web/src/app/manager/_components/ManagerCreditUtility.module.css apps/web/src/app/manager/_components/ManagerAppShell.tsx apps/web/src/app/manager/credit-topup/success/page.tsx apps/web/src/app/manager/credit-topup/fail/page.tsx apps/web/src/app/manager/manager-credit-shell.spec.ts apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat: add global manager credit utility"
```

### Task 9: Credit and Payments Workspace

- [ ] **Task 9 완료 조건:** semantic credit tab renders account/ledger/requests/policy, supports explicit actions, and all action failures remain errors rather than demo successes.

**Files:**
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/page.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css`
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- Modify: `apps/web/src/lib/vendor-mgmt-nav.ts:9-15`
- Modify: `apps/web/src/lib/manager-navigation.ts:127-137`
- Modify: `apps/web/src/app/manager/vendor-mgmt/_components.tsx:54-62,213-216`
- Modify: existing vendor-management navigation specs

**Interfaces:**
- Consumes: `ManagerCreditWorkspace` and Task 7 server mutation functions.
- Produces: `/manager/vendor-mgmt/credit` page and fixed three-tab vendor management navigation.

- [ ] **Step 1: Write workspace RED tests**

Assert exact route/tab labels, 480,000 demo balance, ledger signed amounts, auto-policy controls, payment action visibility by status, reconciliation action for uncertain topups, and token-only CSS. Assert old numeric nav does not become the canonical credit link.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`

Expected: FAIL because the page is missing and navigation still exposes the old two-item structure.

- [ ] **Step 3: Implement the server page and client workspace**

The server page awaits `getManagerCreditWorkspace()` and renders through existing `ManagerVendorMgmtShell`. The client workspace shows:

- Current balance and a 충전 button that calls `openManagerCreditTopup()` from `apps/web/src/lib/vendor-credit-events.ts`, opening the single global modal.
- Ledger rows with signed amount, balanceAfter, type, reference, and date.
- Topup rows including READY/CONFIRMING/RECONCILIATION_REQUIRED/APPROVED/FAILED/CANCELLED; reconcile button only for uncertain/stale orders.
- Payment requests with amount/status and exactly permitted actions: credit/direct for PENDING_APPROVAL and INSUFFICIENT_CREDIT, cancel for PENDING_APPROVAL/INSUFFICIENT_CREDIT only, reverse for AUTO_PAID/MANUAL_CREDIT_PAID, direct void for DIRECT_PAID. `WAITING_COMPLETION` shows “완료 검토 대기” and links back to the repair completion review instead of exposing a payment cancel action.
- Auto policy radio/select and limit input required only for AUTO_DEBIT_UNDER_LIMIT.

Each click generates a fresh `crypto.randomUUID()` idempotency key, disables only the in-flight row, awaits the mutation, then refetches workspace. No optimistic balance change is allowed.

- [ ] **Step 4: Fix vendor-management navigation**

Set canonical internal links to:

```ts
export const MANAGER_VENDOR_MGMT_NAV = [
  { href: "/manager/vendor-mgmt/vendors", label: "내 업체" },
  { href: "/manager/vendor-mgmt/search", label: "업체 찾기" },
  { href: "/manager/vendor-mgmt/credit", label: "크레딧·결제" }
] as const;
```

Keep numeric 00-03 paths as redirects owned by the vendor-management predecessor; do not create a numeric credit route.

- [ ] **Step 5: Run GREEN and web test suite**

Run:

```bash
pnpm --filter web exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
pnpm test:web
```

Expected: workspace contract and complete web unit suite PASS.

- [ ] **Step 6: Commit the credit workspace**

```bash
git add apps/web/src/app/manager/vendor-mgmt/credit apps/web/src/lib/vendor-mgmt-nav.ts apps/web/src/lib/manager-navigation.ts apps/web/src/app/manager/vendor-mgmt/_components.tsx apps/web/src/app/manager/vendor-mgmt
git commit -m "feat: add manager credit payment workspace"
```

### Task 10: Demo Seed, Notification Idempotency, Full Integration, and Verification

- [ ] **Task 10 완료 조건:** demo starts at 100,000, golden scenario ends at 480,000 once, outbox notifications are idempotent, all builds/tests/verify pass, and the final diff contains no unrelated AI/responsibility changes.

**Files:**
- Create: `apps/api/src/credit/vendor-credit-demo-seed.ts`
- Create: `apps/api/src/credit/vendor-credit-demo-seed.spec.ts`
- Modify: `package.json:8-22`
- Verify: `packages/types/src/domain-event.ts` already contains `VENDOR_PAYMENT_REVERSED` from Task 1/workflow contract
- Modify: `apps/api/src/domain-events/domain-event.dispatcher.ts`
- Modify: `apps/api/src/domain-events/domain-event.dispatcher.spec.ts`
- Create: `apps/api/src/credit/credit-golden-flow.spec.ts`
- Modify: `.env.example` to document required `ROOMLOG_DEMO_MANAGER_ID`

**Interfaces:**
- Consumes: predecessor outbox writer/dispatcher and all Tasks 1-9.
- Produces: idempotent presentation seed and end-to-end golden proof.

- [ ] **Step 1: Write seed/event/golden RED tests**

The golden integration test must execute:

```text
OPENING_BALANCE +100000 -> balance 100000
TOPUP +500000          -> balance 600000
AUTO_DEBIT -120000     -> balance 480000
same completion hook   -> balance 480000
same confirm callback  -> balance 480000
```

Assert one OPENING row, one TOPUP row, one debit row, ledger sum equals account balance, request is AUTO_PAID, Cost is CONFIRMED/ALREADY_PAID, no Deposit or BillPaymentTransaction was created, and replayed outbox event keys create one notification each. Add a crash checkpoint after completion approval commit and another after credit commit/before delivery CAS; restart the worker and prove the final balance stays 480,000, debit/Cost/audit each remain one, and both consumer deliveries eventually become DELIVERED independently. Separately leave topup-approved, pending/insufficient, paid, cancelled, reversed, and direct-void notification receipts pending, recreate `DomainEventDispatcher`, and prove its bootstrap poller drains each once without an HTTP request.

- [ ] **Step 2: Run RED**

Run: `ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/credit-golden-flow.spec.ts src/credit/vendor-credit-demo-seed.spec.ts`

Expected: FAIL because the seed command and credit notification mappings are missing.

- [ ] **Step 3: Implement the idempotent demo seed**

`vendor-credit-demo-seed.ts` must require `ROOMLOG_DEMO_MANAGER_ID`, verify the manager exists, and in one direct Prisma transaction create the account at 100,000 plus exactly one OPENING_BALANCE ledger using `idempotencyKey = opening:${managerId}`. A rerun returns the existing matching pair; a pre-existing account whose balance disagrees with its ledger sum exits non-zero rather than rewriting history.

Add root script:

```json
"seed:vendor-credit-demo": "pnpm --filter api exec ts-node src/credit/vendor-credit-demo-seed.ts"
```

- [ ] **Step 4: Add stable credit event mappings**

Use these event keys and codes:

```ts
const creditEventKeys = {
  topupApproved: (orderId: string) => `credit-topup:${orderId}:approved`,
  topupFailed: (orderId: string) => `credit-topup:${orderId}:failed`,
  paymentState: (requestId: string, status: string) => `vendor-payment:${requestId}:${status}`
};
```

Use the workflow contract's exact event codes `MANAGER_CREDIT_TOPUP_SUCCEEDED`, `MANAGER_CREDIT_TOPUP_FAILED`, `VENDOR_PAYMENT_PENDING_APPROVAL`, `VENDOR_PAYMENT_INSUFFICIENT_CREDIT`, `VENDOR_PAYMENT_PAID`, `VENDOR_PAYMENT_REVERSED`, `VENDOR_PAYMENT_CANCELLED`, and `VENDOR_DIRECT_PAYMENT_VOIDED`. Map them to fixed non-AI notification copy in `apps/api/src/domain-events/domain-event.dispatcher.ts`. Topup events target the manager and leave nullable vendorId empty; payment events target the linked vendor account and include the actual vendorId. The dispatcher deduplicates through the unique event key plus `NOTIFICATION` delivery receipt. Do not publish any state notification before the transaction's event+delivery commits.

- [ ] **Step 5: Run the complete API and web suites**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm db:test:push
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm test:api
pnpm test:web
```

Expected: all API and web tests PASS; DB-backed tests do not skip because `ROOMLOG_TEST_DATABASE_URL` is set.

- [ ] **Step 6: Rebuild docker services and run repository verification**

Run:

```bash
docker compose up -d --build api web
docker compose logs --tail=120 api web
bash scripts/verify.sh
```

Expected: both containers remain healthy, logs contain no Nest provider/Prisma migration/Toss configuration startup error, and verify reports successful types, UI, web, API builds plus API smoke.

- [ ] **Step 7: Perform final invariant and scope checks**

Run:

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' apps/web/src/app/manager/_components/ManagerCreditUtility.module.css apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css
rg -n 'RoomlogStore|StoreProjector|persistStore' apps/api/src/credit
rg -n 'demo' apps/web/src/lib/vendor-credit-api.ts
git diff --check
git status --short
```

Expected:

- first command has no matches;
- second command has no matches outside test descriptions explicitly asserting the forbidden dependency;
- third command shows demo use only in GET/read functions;
- `git diff --check` is clean;
- changed files are limited to this plan's credit/payment/Cost/nav/env/test scope and predecessor-owned event mappings.

- [ ] **Step 8: Commit the verified golden slice**

```bash
git add apps/api/src/credit/vendor-credit-demo-seed.ts apps/api/src/credit/vendor-credit-demo-seed.spec.ts apps/api/src/credit/credit-golden-flow.spec.ts apps/api/src/domain-events/domain-event.dispatcher.ts apps/api/src/domain-events/domain-event.dispatcher.spec.ts package.json .env.example
git commit -m "test: prove manager credit golden flow"
```

## Execution Notes

- Execute in the existing isolated worktree. At execution time, use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; do not implement directly from the design branch without task checkpoints.
- Before Task 1, confirm the 100000, 101000, and 110000 commits are present. If their model or outbox symbol names differ, reconcile names in the Task 1/Task 4 interfaces before writing tests; do not duplicate predecessor models.
- After each task, run its focused test and inspect `git diff --stat` before committing. Do not bundle unrelated vendor catalog, activation, estimate, AI, responsibility, tenant payment, or public search changes.
- Request a fresh code review after Task 6 (financial invariants) and Task 9 (complete UI), then run Task 10 verification before any merge or PR.
