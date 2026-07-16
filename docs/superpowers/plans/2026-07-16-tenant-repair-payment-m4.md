# Tenant Repair Payment M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완료 확인된 세입자 책임 수리의 지급 요청을 PhoneFrame용 테스트 Toss 일회성 결제 화면에 연결하고, 성공·실패 콜백을 세입자 소유권으로 처리한다.

**Architecture:** M1의 세입자 결제 주문 API와 M2의 검증된 Toss SDK·주문 정리 상태기계를 재사용한다. 결제는 민원 상세의 지급 요청에서 전용 `/tenant/repair-payment/[paymentRequestId]` 화면으로 이동하며, 서버가 저장한 금액과 복귀 경로만 신뢰한다. 관리자와 세입자의 콜백 공통 알고리즘은 역할별 안전한 복귀 경로 정규화 함수를 주입받는다.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Toss Payments 테스트 SDK, Node test, Docker Compose.

## Global Constraints

- 완료 확인으로 생성된 `payerRole=TENANT`, `status=PENDING_APPROVAL` 지급 요청만 결제할 수 있다.
- 결제 금액은 클라이언트가 보내지 않고 M1 주문 서비스가 `VendorPaymentRequest.amount`에서 읽는다.
- 테스트 Toss 일회성 결제만 사용하며 빌링키·저장 카드·자동 결제는 추가하지 않는다.
- AI 프롬프트·모델·Realtime 음성 코드는 수정하지 않는다.
- READY 주문은 SDK 실패·위젯 렌더 실패·결제 화면 이탈 시 취소를 시도하고, 정리 불명확 상태에서는 결제를 잠근다.
- 내부 주문 ID, `paymentKey`, `payerUserId`는 화면과 URL에 노출하지 않는다.
- M5 범위인 전 화면 재결제·취소 UX 표준화는 추가하지 않는다.
- 새 스타일은 `packages/ui/src/tokens.css`의 CSS 변수만 사용한다.

---

### Task 1: 역할 공통 결제 안전 상태기계와 콜백 코어

**Files:**
- Create: `apps/web/src/lib/repair-payment-lifecycle.ts`
- Create: `apps/web/src/lib/repair-payment-callback.ts`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/manager-repair-payment-lifecycle.ts`
- Modify: `apps/web/src/app/manager/repair-payment/callback.ts`
- Test: `apps/web/src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.spec.ts`
- Test: `apps/web/src/app/manager/repair-payment/manager-repair-payment-callback.spec.ts`

**Interfaces:**
- Produces: `RepairPaymentLifecycle`, `resolveRepairPaymentSuccess`, `resolveRepairPaymentFailure`, `markerForRepairPaymentOrder`.
- Preserves: existing `ManagerRepairPaymentLifecycle` and manager callback exports as compatibility aliases/wrappers.

- [ ] **Step 1: Write failing shared lifecycle/callback contract tests**

Assert that manager compatibility exports delegate to the role-neutral modules and that callback resolution accepts a role-safe `normalizeReturnPath` function.

- [ ] **Step 2: Run the focused manager payment tests and confirm RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.spec.ts src/app/manager/repair-payment/manager-repair-payment-callback.spec.ts`

- [ ] **Step 3: Extract the existing race-safe state machine without behavior changes**

```ts
export class RepairPaymentLifecycle {
  constructor(private readonly cancelOrder: (checkout: RepairPaymentCheckout) => Promise<void>) {}
}

export {
  RepairPaymentLifecycle as ManagerRepairPaymentLifecycle,
  type RepairPaymentLifecycleResult as ManagerRepairPaymentLifecycleResult,
};
```

- [ ] **Step 4: Extract callback resolution with injected return-path normalization**

```ts
export async function resolveRepairPaymentSuccess(
  params: CallbackParams,
  dependencies: SuccessDependencies,
  normalizeReturnPath: (value?: string) => string,
): Promise<string>;
```

- [ ] **Step 5: Confirm manager focused tests GREEN and commit Task 1**

---

### Task 2: 세입자 결제 API 클라이언트와 안전한 콜백 라우트

**Files:**
- Create: `apps/web/src/lib/tenant-repair-payment-api.ts`
- Create: `apps/web/src/lib/tenant-repair-payment-api.spec.ts`
- Create: `apps/web/src/lib/tenant-repair-payment-return-path.ts`
- Create: `apps/web/src/lib/tenant-repair-payment-return-path.spec.ts`
- Create: `apps/web/src/app/tenant/repair-payment/callback.ts`
- Create: `apps/web/src/app/tenant/repair-payment/tenant-repair-payment-callback.spec.ts`
- Create: `apps/web/src/app/tenant/repair-payment/success/page.tsx`
- Create: `apps/web/src/app/tenant/repair-payment/fail/page.tsx`

**Interfaces:**
- Produces: `createTenantRepairPaymentOrder`, `getTenantRepairPaymentOrder`, `confirmTenantRepairPaymentOrder`, `reconcileTenantRepairPaymentOrder`, `cancelTenantRepairPaymentOrder`.
- Produces: `normalizeTenantRepairPaymentReturnPath` allowing only `/tenant/repair-payment/*` and removing one-shot callback markers.

- [ ] **Step 1: Write failing exact-route, redaction-boundary, and open-redirect tests**

Expected routes are `/tenant/vendor-payment-requests/:id/toss-orders` and `/tenant/repair-payment-orders/:orderId/(confirm|reconcile|cancel)`.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/lib/tenant-repair-payment-api.spec.ts src/lib/tenant-repair-payment-return-path.spec.ts src/app/tenant/repair-payment/tenant-repair-payment-callback.spec.ts`

- [ ] **Step 3: Implement no-demo server clients and tenant-only return-path normalization**

```ts
export const normalizeTenantRepairPaymentReturnPath = (
  value: string | null | undefined,
  fallback = "/living",
): string => {
  if (!value || value.startsWith("//")) return fallback;
  const parsed = new URL(value, "https://roomlog.invalid");
  if (
    parsed.origin !== "https://roomlog.invalid"
    || !parsed.pathname.startsWith("/tenant/repair-payment/")
  ) return fallback;
  parsed.searchParams.delete("repairPayment");
  parsed.searchParams.delete("repairPaymentOrderId");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
```

- [ ] **Step 4: Add success/failure pages using the shared callback core**

Success confirms with stored tenant authority; failure cancels only a stored READY order. Missing or malformed callback values fall back without trusting query amounts.

- [ ] **Step 5: Confirm focused tests GREEN and commit Task 2**

---

### Task 3: PhoneFrame 세입자 Toss 결제 화면과 민원 상세 연결

**Files:**
- Create: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/page.tsx`
- Create: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.tsx`
- Create: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.module.css`
- Create: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/tenant-repair-payment-checkout.spec.ts`
- Modify: `apps/web/src/app/my/flows/TenantVendorWorkflowPanel.tsx`
- Modify: `apps/web/src/app/my/flows/tenant-vendor-workflow.spec.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle, Task 2 tenant order client, M3 `paymentRequest.id/amount/status`.
- Produces: `/tenant/repair-payment/[paymentRequestId]?complaintId=...` PhoneFrame checkout.

- [ ] **Step 1: Write failing screen and workflow-link tests**

Verify that only `PENDING_APPROVAL` renders an enabled `결제하기`, `TOSS_PAID` renders `결제 완료`, and other request states do not open checkout.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/tenant/repair-payment/[paymentRequestId]/tenant-repair-payment-checkout.spec.ts src/app/my/flows/tenant-vendor-workflow.spec.ts`

- [ ] **Step 3: Implement the PhoneFrame checkout with server-authoritative amount**

The first user action creates a READY order, chooses widget/payment-window mode, renders payment methods and agreement in a bounded scroll region, and calls `requestTossPayment` with tenant success/fail paths.

- [ ] **Step 4: Apply callback result copy and safe navigation**

Use `결제 미완료`, `결제 확인 중`, `결제 완료`, `주문 취소`. The detail return link points to `/living` with only the opaque complaint id needed to reopen the existing detail flow.

- [ ] **Step 5: Confirm focused tests and production web build GREEN; commit Task 3**

---

### Task 4: M4 통합 검증과 Docker 재빌드

**Files:**
- Modify: `.superpowers/sdd/progress.md` (local ignored progress record)

**Interfaces:**
- Verifies: tenant ownership, completion gate, callback status, M2 manager regression, responsive checkout.

- [ ] **Step 1: Run focused M1 tenant authority tests and M2 manager regressions**

Run: `pnpm --filter api exec node --test -r ts-node/register src/credit/repair-payment-order.controller.spec.ts src/credit/repair-payment-order.service.spec.ts`

- [ ] **Step 2: Run all web tests once**

Run: `pnpm test:web`

- [ ] **Step 3: Run repository verification**

Run: `bash scripts/verify.sh`

- [ ] **Step 4: Rebuild Docker web/API and inspect health**

Run: `docker compose -p roomlog up -d --build web api`

- [ ] **Step 5: Confirm `/living`, tenant payment route, and `/api/health` without completing a real payment**

- [ ] **Step 6: Review only M4 diff and commit the final verification record**
