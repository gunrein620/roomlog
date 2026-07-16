# Manager Repair Payment M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 크레딧·결제 화면에서 완료 승인된 업체 지급 요청을 테스트 Toss 일회성 결제로 결제하고, 성공·실패·확인 중 결과를 안전하게 원래 화면에 반영한다.

**Architecture:** M1의 관리자 `RepairPaymentOrder` API를 그대로 사용하고 웹 전용 API 클라이언트와 전용 결제 dialog를 추가한다. Toss 콜백은 서버 라우트에서 저장된 주문의 `returnPath`만 신뢰해 승인·취소 후 크레딧·결제 화면으로 되돌리며, 화면은 authoritative workspace를 다시 읽어 지급 요청 상태를 표시한다. 기존 크레딧 지급과 외부 지급 기록은 별도 선택지로 유지한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, CSS Modules, `@roomlog/types`, Toss Payments v2 test SDK, NestJS M1 payment APIs

## Global Constraints

- 테스트 Toss 일회성 결제만 사용하고 빌링키·저장 카드·자동 카드 결제를 추가하지 않는다.
- AI 프롬프트·Realtime 도구·음성 흐름은 수정하지 않는다.
- M1 API, Prisma 스키마, 마이그레이션은 M2에서 변경하지 않는다.
- 관리자 지급 요청의 결제 가능 상태는 서버가 강제하며 클라이언트 금액을 신뢰하지 않는다.
- `DIRECT`는 Toss가 아니라 외부 이체·현장 지급 기록 의미를 유지한다.
- `CONFIRMING`과 `RECONCILIATION_REQUIRED`는 `결제 확인 중`, `READY`와 `FAILED`는 `결제 미완료`로 표시한다.
- M5 범위인 통합 재결제·주문 정리 UX는 추가하지 않는다.
- API 연결 실패를 가짜 결제 성공으로 대체하지 않는다.
- 관리자 CSS는 공유 토큰 `var(--...)`만 사용하고 raw hex를 추가하지 않는다.
- 콜백은 URL의 임의 `returnPath`를 신뢰하지 않고 저장된 주문의 `returnPath`만 사용한다.
- 각 production 변경은 실패하는 테스트를 먼저 확인한 뒤 최소 구현으로 통과시킨다.

---

### Task 1: Manager Repair Payment Web API Contract

**Files:**
- Modify: `apps/web/src/lib/vendor-credit-api.ts`
- Modify: `apps/web/src/lib/credit-return-path.ts`
- Modify: `apps/web/src/lib/credit-return-path.spec.ts`

**Interfaces:**
- Consumes: `CreateRepairPaymentOrderInput`, `ConfirmRepairPaymentOrderInput`, `RepairPaymentCheckout`, `RepairPaymentOrderPublicView` from `@roomlog/types`
- Produces: `createManagerRepairPaymentOrder`, `getManagerRepairPaymentOrder`, `confirmManagerRepairPaymentOrder`, `reconcileManagerRepairPaymentOrder`, `cancelManagerRepairPaymentOrder`

- [ ] **Step 1: Write the failing API and return-path contract tests**

Add assertions that the manager client calls only the M1 manager routes and that callback markers are removed from a stored return path:

```ts
assert.equal(
  normalizeManagerReturnPath(
    "/manager/vendor-mgmt/credit?repairPayment=approved&repairPaymentOrderId=repair-order-1#requests",
  ),
  "/manager/vendor-mgmt/credit#requests",
);

for (const route of [
  "/manager/vendor-payment-requests/",
  "/toss-orders",
  "/manager/repair-payment-orders/",
  "/confirm",
  "/reconcile",
  "/cancel",
]) {
  assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/credit-return-path.spec.ts
```

Expected: FAIL because repair callback markers and manager repair-payment client functions do not exist.

- [ ] **Step 3: Add the minimal manager API client**

Add these exact public functions to `vendor-credit-api.ts`:

```ts
export function createManagerRepairPaymentOrder(
  paymentRequestId: string,
  input: CreateRepairPaymentOrderInput,
): Promise<RepairPaymentCheckout> {
  return serverFetch<RepairPaymentCheckout>(
    `/manager/vendor-payment-requests/${encodeURIComponent(paymentRequestId)}/toss-orders`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}`,
  );
}

export function confirmManagerRepairPaymentOrder(
  orderId: string,
  input: ConfirmRepairPaymentOrderInput,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reconcileManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/reconcile`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function cancelManagerRepairPaymentOrder(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  return serverFetch<RepairPaymentOrderPublicView>(
    `/manager/repair-payment-orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
```

Extend `normalizeManagerReturnPath` with:

```ts
parsed.searchParams.delete("repairPayment");
parsed.searchParams.delete("repairPaymentOrderId");
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vendor-credit-api.ts apps/web/src/lib/credit-return-path.ts apps/web/src/lib/credit-return-path.spec.ts
git commit -m "feat(payment): add manager repair checkout client"
```

---

### Task 2: Trusted Manager Toss Callback Routes

**Files:**
- Create: `apps/web/src/app/manager/repair-payment/success/page.tsx`
- Create: `apps/web/src/app/manager/repair-payment/fail/page.tsx`
- Create: `apps/web/src/app/manager/repair-payment/manager-repair-payment-callback.spec.ts`

**Interfaces:**
- Consumes: Task 1 manager repair-payment API functions and `normalizeManagerReturnPath`
- Produces: `/manager/repair-payment/success`, `/manager/repair-payment/fail`, callback markers `repairPayment` and `repairPaymentOrderId`

- [ ] **Step 1: Write failing source-contract tests**

The callback spec must require all of these behaviors:

```ts
assert.match(success, /confirmManagerRepairPaymentOrder/);
assert.match(success, /getManagerRepairPaymentOrder/);
assert.match(success, /normalizeManagerReturnPath\(order\.returnPath\)/);
assert.match(success, /reconciliation_required/);
assert.doesNotMatch(success, /params\.returnPath|searchParams[\s\S]{0,100}returnPath/);

assert.match(fail, /getManagerRepairPaymentOrder/);
assert.match(fail, /order\.status === "READY"/);
assert.match(fail, /cancelManagerRepairPaymentOrder/);
assert.match(fail, /normalizeManagerReturnPath\(order\.returnPath\)/);
assert.doesNotMatch(fail, /params\.returnPath|searchParams[\s\S]{0,100}returnPath/);
```

- [ ] **Step 2: Run the callback spec and verify RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/repair-payment/manager-repair-payment-callback.spec.ts
```

Expected: FAIL because both callback pages are missing.

- [ ] **Step 3: Implement the success callback**

Use these terminal marker rules:

```ts
type RepairPaymentMarker =
  | "approved"
  | "reconciliation_required"
  | "cancelled"
  | "failed";

function markerForOrder(order: RepairPaymentOrderPublicView): RepairPaymentMarker {
  if (order.status === "APPROVED") return "approved";
  if (order.status === "CONFIRMING" || order.status === "RECONCILIATION_REQUIRED") {
    return "reconciliation_required";
  }
  if (order.status === "CANCELLED") return "cancelled";
  return "failed";
}
```

The success page must validate `paymentKey`, `orderId`, and a positive safe-integer `amount`; call confirm when valid; otherwise read the stored order; on confirm failure read the stored order; and always redirect through `normalizeManagerReturnPath(order.returnPath)` with the two callback markers.

- [ ] **Step 4: Implement the fail callback**

The fail page must read the stored order first, cancel only a stored `READY` order, fall back to another stored read if cancellation throws, then redirect through the stored return path and terminal marker. It must never cancel `CONFIRMING`, `RECONCILIATION_REQUIRED`, or `APPROVED`.

- [ ] **Step 5: Run the focused spec and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/manager/repair-payment
git commit -m "feat(payment): handle manager repair callbacks"
```

---

### Task 3: Dedicated Manager Repair Toss Dialog

**Files:**
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/ManagerRepairPaymentDialog.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/ManagerRepairPaymentDialog.module.css`
- Create: `apps/web/src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.spec.ts`

**Interfaces:**
- Consumes: `RepairPaymentCheckout`, existing `requestManagerCardPayment`, `createTossWidgets`, `tossPaymentMode`, M1 browser BFF routes
- Produces: `ManagerRepairPaymentDialogHandle.open(request)`, `onResultMessage(message)`, `onWorkspaceRefresh()`

- [ ] **Step 1: Write a failing dialog contract test**

Require a real modal, server-owned amount, safe cleanup, widget selectors, and the two callback routes:

```ts
for (const value of [
  "집우집주 수리비 결제",
  "업체",
  "수리 항목",
  "결제 금액",
  "Toss로 결제",
  "/manager/repair-payment/success",
  "/manager/repair-payment/fail",
  "createTossWidgets",
  "requestManagerCardPayment",
  "toss-orders",
  "/cancel",
]) {
  assert.match(dialog, new RegExp(value.replaceAll("/", "\\/")));
}
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /checkout\.order\.amount/);
assert.doesNotMatch(dialog, /amount:\s*request\.amount/);
assert.match(css, /var\(--/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.spec.ts
```

Expected: FAIL because the dialog and CSS do not exist.

- [ ] **Step 3: Implement the dialog state contract**

Use this public request shape and handle:

```ts
export type ManagerRepairPaymentTarget = {
  paymentRequestId: string;
  vendorName: string;
  jobLabel: string;
  amount: number;
};

export type ManagerRepairPaymentDialogHandle = {
  open(target: ManagerRepairPaymentTarget): void;
};
```

The dialog must:

1. Open with vendor, job, and requested amount summary.
2. POST `{ creationKey: crypto.randomUUID(), returnPath }` to the manager M1 create route.
3. Render Toss payment methods and agreement only after a widget-key checkout is prepared.
4. Use `checkout.order.amount`, `checkout.order.orderId`, `checkout.customerKey`, and `checkout.orderName` for the payment request.
5. Use the manager repair success/fail callback URLs.
6. Cancel a prepared `READY` order when the user closes, SDK loading fails, widget rendering fails, or a pre-navigation payment request rejects.
7. Keep the dialog open with an actionable inline error when cancellation itself fails.
8. Disable controls while an order mutation or payment request is running.

- [ ] **Step 4: Implement token-only desktop styling**

The CSS module must use a centered native dialog with `width: min(var(--content-narrow-max), calc(100% - var(--space-xxl)))`, a two-column vendor/job summary, a single prominent amount, bounded widget content, and paired cancel/pay actions. Hover and focus-visible borders must not shift layout.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/manager/vendor-mgmt/credit/ManagerRepairPaymentDialog.tsx apps/web/src/app/manager/vendor-mgmt/credit/ManagerRepairPaymentDialog.module.css apps/web/src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.spec.ts
git commit -m "feat(payment): add manager repair checkout dialog"
```

---

### Task 4: Credit Workspace Payment Choice Integration

**Files:**
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- Modify: `apps/web/src/lib/vendor-workflow-presenter.ts`
- Modify: `apps/web/src/lib/vendor-workflow-ui.spec.ts`

**Interfaces:**
- Consumes: Task 3 dialog handle and M1 `VendorPaymentRequestStatus`
- Produces: three distinct manager choices — `크레딧으로 지급`, `Toss로 결제`, `외부 지급 기록`

- [ ] **Step 1: Write failing workspace behavior tests**

Require that eligible rows show three semantically distinct choices and that Toss-paid rows have no financial correction controls:

```ts
for (const label of [
  "크레딧으로 지급",
  "Toss로 결제",
  "외부 지급 기록",
  "외부 지급 일시",
  "Toss 결제 완료",
  "결제 확인 중",
  "결제 미완료",
]) {
  assert.match(workspace, new RegExp(label));
}
assert.match(workspace, /repairPaymentOrderId/);
assert.match(workspace, /getManagerRepairPaymentOrder|repair-payment-orders/);
assert.match(workspace, /ManagerRepairPaymentDialog/);
const actionStart = workspace.indexOf("  function renderPaymentActions");
const workspaceReturn = workspace.indexOf(
  "\n\n  return (\n    <div className={styles.workspace}>",
  actionStart,
);
const actionRenderer = workspace.slice(actionStart, workspaceReturn);
const tossPaidBranch = actionRenderer.match(/request\.status === "TOSS_PAID"[\s\S]*?(?=request\.status|\n\s*}\n|$)/)?.[0] ?? "";
assert.doesNotMatch(tossPaidBranch, /지급 취소|직접 결제 취소|외부 지급 취소/);
```

Update presenter expectations so `DIRECT_PAID` is `외부 지급 기록 완료`, while `TOSS_PAID` remains `Toss 결제 완료`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts \
  src/lib/vendor-workflow-ui.spec.ts
```

Expected: FAIL because the Toss dialog, callback result handling, and new external-record labels are absent.

- [ ] **Step 3: Integrate the payment dialog**

Add one dialog instance at workspace root and keep a ref to it. On an eligible manager request, pass only:

```ts
{
  paymentRequestId: request.id,
  vendorName: request.vendorName ?? "업체 정보 확인 필요",
  jobLabel: [request.roomLabel, request.repairTitle].filter(Boolean).join(" · ")
    || "수리 작업 정보 확인 필요",
  amount: request.amount,
}
```

`Toss로 결제` must not call the legacy settle endpoint. The dialog alone calls the M1 order route.

- [ ] **Step 4: Handle callback state authoritatively**

On mount, read `repairPayment` and `repairPaymentOrderId`. If both exist, GET the stored M1 order through the manager BFF, map the actual stored status to one of these messages, remove both markers with `history.replaceState`, and refresh the workspace:

```ts
const repairPaymentMessage: Record<RepairPaymentOrderStatus, string> = {
  READY: "결제가 완료되지 않았습니다. 다시 결제할 수 있습니다.",
  CONFIRMING: "결제 확인 중입니다. 잠시 후 상태를 다시 확인해 주세요.",
  RECONCILIATION_REQUIRED: "결제 확인 중입니다. 상태 확인이 필요합니다.",
  APPROVED: "Toss 업체비 결제가 완료됐습니다.",
  FAILED: "결제가 완료되지 않았습니다. 결제수단을 확인해 주세요.",
  CANCELLED: "결제 주문이 취소됐습니다.",
};
```

Never derive success from the marker alone. If the authoritative GET fails, keep current workspace data and show `결제 결과를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.`.

- [ ] **Step 5: Separate the three choices visually and semantically**

Rename the legacy external record UI:

- `크레딧 지급` → `크레딧으로 지급`
- `직접 결제 일시` → `외부 지급 일시`
- `직접 결제` → `외부 지급 기록`
- `직접 결제 완료` → `외부 지급 기록 완료`
- `직접 결제 취소` → `외부 지급 기록 취소`

Group the three payment choices under one `지급 방식` label. Keep the external evidence inputs in their own bordered subpanel so Toss and external recording cannot be mistaken for the same action.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts apps/web/src/lib/vendor-workflow-presenter.ts apps/web/src/lib/vendor-workflow-ui.spec.ts
git commit -m "feat(payment): connect manager Toss settlement UI"
```

---

### Task 5: M2 Regression, Docker, and Browser Checkpoint

**Files:**
- Modify only if verification exposes an M2 regression: files already listed in Tasks 1-4
- Verify: manager credit workspace, callback routes, M1 API, existing credit topup, external payment record

**Interfaces:**
- Consumes: completed M2 UI and existing Docker stack
- Produces: reviewable M2 checkpoint ready for M3, without tenant UI or AI implementation

- [ ] **Step 1: Confirm latest dev and worktree scope**

```bash
git fetch origin dev
git rev-list --left-right --count HEAD...origin/dev
git status --short
git diff --check origin/dev...HEAD
```

Expected: right-side count `0`, clean tracked state except intentional M2 files, no whitespace errors.

- [ ] **Step 2: Run focused and complete web tests**

```bash
pnpm test:web
```

Expected: all property and TypeScript unit tests pass.

- [ ] **Step 3: Run API regression and repository verification**

```bash
env -u ROOMLOG_TEST_DATABASE_URL pnpm test:api
bash scripts/verify.sh
```

Expected: API tests pass with DB-only suites skipped when the explicit test DB is absent; types, UI, web, API build, and smoke pass.

- [ ] **Step 4: Rebuild Docker and verify runtime**

```bash
COMPOSE_PROJECT_NAME=roomlog docker compose up -d --build
COMPOSE_PROJECT_NAME=roomlog docker compose ps -a
curl -fsS http://localhost:4000/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
```

Expected: migration exits `0`, PostgreSQL is healthy, API and web remain up, health is `ok`, login is HTTP `200`.

- [ ] **Step 5: Browser-verify the manager flow**

Using a real manager session and an eligible `PENDING_APPROVAL` or `INSUFFICIENT_CREDIT` request:

1. Open `/manager/vendor-mgmt/credit`.
2. Confirm three separate choices are visible.
3. Open `Toss로 결제`; verify vendor, repair, and amount match the row.
4. Close before payment; verify the prepared order is cancelled and the row remains unpaid.
5. Reopen, complete a test Toss payment, and verify callback returns to the stored workspace path.
6. Verify the row shows `Toss 결제 완료` and the credit balance did not decrease.
7. Verify existing 크레딧 지급 and 외부 지급 기록 controls still work independently.

- [ ] **Step 6: Final diff review and checkpoint commit**

```bash
git status --short
git diff --stat origin/dev...HEAD
git diff --check origin/dev...HEAD
git add docs/superpowers/plans/2026-07-16-manager-repair-payment-m2.md
git commit -m "test(payment): verify manager repair checkout"
```

Skip the final commit when the plan file is already committed and verification produces no tracked changes.

## M2 Exit Criteria

- Eligible manager requests expose `크레딧으로 지급`, `Toss로 결제`, and `외부 지급 기록` as distinct actions.
- The Toss dialog displays server-owned checkout amount and never accepts a client amount override.
- Closing or pre-navigation failure cancels a prepared READY order.
- Success confirmation and fail cancellation use only the stored order return path.
- Callback messages come from an authoritative order read, not query markers.
- Toss approval changes the request to `TOSS_PAID` without changing the credit ledger balance.
- Existing credit topup, manual credit settlement, automatic credit policy, and external-payment evidence remain green.
- Tenant payment UI, tenant completion flow, AI implementation, retry recovery UX, refunds, and billing keys remain untouched.
- Full tests, builds, Docker rebuild, API health, and manager browser verification pass.
