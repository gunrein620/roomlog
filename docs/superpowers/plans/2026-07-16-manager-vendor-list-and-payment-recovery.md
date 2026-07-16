# Manager Vendor List and Payment Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make vendor detail and archive actions explicit in the manager vendor list, separate vendor status indicators, and complete M5 repair-payment recovery UX for managers and tenants.

**Architecture:** Reuse the existing soft-archive server action and isolate list confirmation in one client control. Expose the latest public repair-payment order beside each manager or tenant payment request, derive labels and allowed recovery actions from one shared presenter, and route retry/cancel/reconcile through the existing M1 APIs.

**Tech Stack:** Next.js 16 App Router, React 19, NestJS 11, Prisma 7, TypeScript, Node test runner, Docker Compose.

## Global Constraints

- Work on `yong/vendor-credit-core`; do not push or create a PR unless requested.
- Keep manager screens inside `ManagerShell` and tenant screens inside the existing mobile flow.
- Use only CSS variables from `packages/ui/src/tokens.css`; no raw hex colors.
- Do not change AI prompts, voice logic, Toss server authorization rules, or database schema.
- Vendor removal is `ManagerVendor.status=ARCHIVED`; never delete vendor, work, or payment history.
- `READY` and `FAILED` show `결제 미완료`; `CONFIRMING` and `RECONCILIATION_REQUIRED` show `결제 확인 중`.
- `READY` and `FAILED` allow retry and cancellation; confirming states allow reconciliation only; approved orders expose no recovery mutation.
- Use TDD for every behavior change and make separate vendor-list and M5 commits.

---

### Task 1: Vendor List Actions and Confirmation

**Files:**
- Create: `apps/web/src/app/manager/vendor-mgmt/vendors/ManagerVendorArchiveControl.tsx`
- Create: `apps/web/src/app/manager/vendor-mgmt/vendors/ManagerVendorArchiveControl.module.css`
- Modify: `apps/web/src/app/manager/vendor-mgmt/vendors/page.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/_components.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/VendorWorkspace.module.css`
- Test: `apps/web/src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts`

**Interfaces:**
- Consumes: `archiveVendorAction(previousState, formData)` and `MANAGER_VENDOR_MGMT_PATHS.vendor(vendorId)`.
- Produces: `ManagerVendorArchiveControl({ vendorId, vendorName, disabled })` and an explicit management cell for every active vendor.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that the vendors page renders a row archive control, that the table says `관리`, and that each row exposes `상세 보기`:

```ts
assert.match(vendorsPage, /ManagerVendorArchiveControl/);
assert.match(components, /<th>관리<\/th>/);
assert.match(components, />상세 보기</);
assert.match(archiveControl, /작업·결제 이력은 유지/);
assert.match(archiveControl, /신규 작업 배정 후보에서만 제외/);
```

- [ ] **Step 2: Run the focused vendor workflow test and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts
```

Expected: FAIL because the archive control and explicit management actions are absent.

- [ ] **Step 3: Implement the archive control and explicit management cell**

The client control owns only confirmation and action feedback:

```tsx
export function ManagerVendorArchiveControl({ vendorId, vendorName, disabled }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(archiveVendorAction, INITIAL_MANAGER_MUTATION_STATE);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.status]);

  return <>{/* 해제 button + bounded dialog + hidden vendorId + feedback */}</>;
}
```

`ManagerVendorTable` accepts a `renderManagement` callback and renders:

```tsx
<td>
  <div className={styles.managementActions}>
    <Link className={styles.detailButton} href={MANAGER_VENDOR_MGMT_PATHS.vendor(vendor.vendorId)}>
      상세 보기
    </Link>
    {renderManagement?.(vendor)}
  </div>
</td>
```

- [ ] **Step 4: Run the focused test and web build**

```bash
pnpm --filter web build
```

Expected: vendor test and Next build PASS.

---

### Task 2: Vendor Status and Progress Separation

**Files:**
- Modify: `apps/web/src/app/manager/vendor-mgmt/_components.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/search/page.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/VendorWorkspace.module.css`
- Test: `apps/web/src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts`

**Interfaces:**
- Consumes: `assignmentBlockLabel`, `verificationLabel`, `accountStatusLabel`, `StatusPill`.
- Produces: `.statusStack` with explicit child blocks and `.statusReasonList` with one pill per block reason.

- [ ] **Step 1: Add failing assertions for independent status blocks**

```ts
assert.match(components, /statusStack/);
assert.match(css, /\.statusStack\s*>\s*span[\s\S]*display:\s*block/);
assert.doesNotMatch(searchPage, /assignmentBlockReasons[\s\S]*\.join\(" · "\)/);
assert.match(searchPage, /assignmentBlockReasons\.map/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Use the Task 1 focused command. Expected: FAIL on `.join(" · ")` and missing explicit child layout.

- [ ] **Step 3: Render verification, account, and block reasons independently**

```tsx
<div className={styles.statusStack}>
  <span>{verificationLabel[candidate.catalog.verificationStatus]}</span>
  <span>{accountStatusLabel[candidate.accountStatus]}</span>
  <div className={styles.statusReasonList}>
    {candidate.canAssign
      ? <StatusPill active>배정 가능</StatusPill>
      : candidate.assignmentBlockReasons.map((reason) => (
          <StatusPill active={false} key={reason}>{assignmentBlockLabel[reason]}</StatusPill>
        ))}
  </div>
</div>
```

Use `display:grid` plus token gap for `.statusStack`, `.statusReasonList`, and the list-table progress spans.

- [ ] **Step 4: Run the focused test and web build**

Expected: PASS and no raw color values added.

- [ ] **Step 5: Commit vendor-list work**

```bash
git add apps/web/src/app/manager/vendor-mgmt
git commit -m "feat(vendor): expose list actions and split statuses"
```

---

### Task 3: Latest Repair-Payment Order Projection and Shared Recovery Presenter

**Files:**
- Create: `apps/api/src/credit/repair-payment-order-public.ts`
- Create: `apps/web/src/lib/repair-payment-recovery.ts`
- Create: `apps/web/src/lib/repair-payment-recovery.spec.ts`
- Modify: `packages/types/src/vendor-credit.ts`
- Modify: `packages/types/src/tenant-vendor-connection.ts`
- Modify: `apps/api/src/credit/repair-payment-order.service.ts`
- Modify: `apps/api/src/credit/repair-payment-order.controller.ts`
- Modify: `apps/api/src/credit/prisma-credit-query.repository.ts`
- Modify: `apps/api/src/credit/credit.controller.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Test: `apps/api/src/credit/vendor-credit.contract.spec.ts`
- Test: `apps/api/src/credit/credit.controller.spec.ts`
- Test: `apps/api/src/roomlog/vendor-workflow.contract.spec.ts`

**Interfaces:**
- Produces: `latestRepairPaymentOrder?: RepairPaymentOrderPublicView` on `ManagerVendorPaymentRequestPublicView` and `TenantVendorWorkflowView`.
- Produces: `repairPaymentRecovery(status)` returning `{ label, canRetry, canCancel, canReconcile }`.

- [ ] **Step 1: Write failing type, projection, and presenter tests**

```ts
assert.deepEqual(repairPaymentRecovery("READY"), {
  label: "결제 미완료", canRetry: true, canCancel: true, canReconcile: false,
});
assert.deepEqual(repairPaymentRecovery("RECONCILIATION_REQUIRED"), {
  label: "결제 확인 중", canRetry: false, canCancel: false, canReconcile: true,
});
```

Controller tests must prove private `id`, `payerUserId`, and `paymentKey` are absent from nested orders.

- [ ] **Step 2: Run focused API and web tests and verify RED**

From `apps/api` and `apps/web`, use Node test runner with `ts-node/register` for the exact spec files. Expected: FAIL on missing nested order and presenter.

- [ ] **Step 3: Add public projection and latest-order queries**

Use one pure public mapper:

```ts
export function publicRepairPaymentOrder(order: RepairPaymentOrderView): RepairPaymentOrderPublicView {
  const { id: _id, paymentKey: _paymentKey, payerUserId: _payer, confirmationId: _confirmation, toolCallId: _toolCall, ...visible } = order;
  return visible;
}
```

Both manager and tenant Prisma includes select the latest order only:

```ts
repairPaymentOrders: {
  orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
}
```

- [ ] **Step 4: Implement the shared browser presenter**

```ts
export function repairPaymentRecovery(status?: RepairPaymentOrderStatus) {
  if (status === "READY" || status === "FAILED") return { label: "결제 미완료", canRetry: true, canCancel: true, canReconcile: false };
  if (status === "CONFIRMING" || status === "RECONCILIATION_REQUIRED") return { label: "결제 확인 중", canRetry: false, canCancel: false, canReconcile: true };
  if (status === "APPROVED") return { label: "결제 완료", canRetry: false, canCancel: false, canReconcile: false };
  return { label: "주문 취소", canRetry: false, canCancel: false, canReconcile: false };
}
```

- [ ] **Step 5: Build shared types, then run focused tests**

```bash
pnpm --filter @roomlog/types build
```

Expected: focused API and web tests PASS.

---

### Task 4: Manager Repair-Payment Recovery UX

**Files:**
- Modify: `apps/web/src/lib/vendor-credit-api.ts`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/ManagerRepairPaymentDialog.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css`
- Test: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- Test: `apps/web/src/app/manager/vendor-mgmt/credit/manager-repair-payment-dialog.component.spec.ts`

**Interfaces:**
- Produces: `retryManagerRepairPaymentOrder(orderId, input)`.
- Extends dialog target with `retryOrderId?: string`; retry returns a fresh `RepairPaymentCheckout` and follows the existing Toss render/request path.

- [ ] **Step 1: Write failing route and component tests**

Assert that READY/FAILED rows show `다시 결제` and `주문 취소`, confirming states show `상태 다시 확인`, and approved rows show no recovery buttons.

- [ ] **Step 2: Run focused tests and verify RED**

Use the web Node test runner for the two listed specs. Expected: FAIL on missing retry route and buttons.

- [ ] **Step 3: Add manager retry client and dialog retry entry**

```ts
export function retryManagerRepairPaymentOrder(orderId: string, input: RetryRepairPaymentOrderInput) {
  return serverFetch<RepairPaymentCheckout>(`/manager/repair-payment-orders/${encodeURIComponent(orderId)}/retry`, {
    method: "POST", body: JSON.stringify(input),
  });
}
```

The dialog calls retry instead of create when `retryOrderId` exists, while reusing the same lifecycle, widget, cleanup, and callbacks.

- [ ] **Step 4: Render state and recovery actions in payment-request rows**

Use `repairPaymentRecovery(request.latestRepairPaymentOrder?.status)` and call cancel/reconcile/retry through existing `runMutation` and workspace refresh paths.

- [ ] **Step 5: Run focused tests and web build**

Expected: PASS.

---

### Task 5: Tenant Repair-Payment Recovery UX

**Files:**
- Modify: `apps/web/src/lib/tenant-repair-payment-api.ts`
- Modify: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.tsx`
- Modify: `apps/web/src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.module.css`
- Test: `apps/web/src/lib/tenant-repair-payment-api.spec.ts`
- Test: `apps/web/src/app/tenant/repair-payment/tenant-repair-payment-checkout.spec.ts`

**Interfaces:**
- Produces: `retryTenantRepairPaymentOrder(orderId, input)`.
- Consumes: `workflow.latestRepairPaymentOrder` and the shared recovery presenter.

- [ ] **Step 1: Write failing tenant retry and state-action tests**

Assert exact retry route, recovery labels, READY/FAILED retry and cancel actions, confirming reconciliation, and approved no-op behavior.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL on missing retry client and action routing.

- [ ] **Step 3: Implement retry, cancel, and reconcile handlers**

```ts
const recovery = repairPaymentRecovery(workflow?.latestRepairPaymentOrder?.status);
```

Retry feeds the returned checkout into the existing lifecycle and Toss widget path. Cancel and reconcile reload the workflow after success. Confirming states keep the primary payment button disabled.

- [ ] **Step 4: Run focused tests and responsive web build**

Expected: PASS with the footer remaining within `PhoneFrame` width.

- [ ] **Step 5: Commit M5 implementation**

```bash
git add packages/types apps/api/src/credit apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/web/src/lib apps/web/src/app/manager/vendor-mgmt/credit apps/web/src/app/tenant/repair-payment
git commit -m "feat(payment): complete repair payment recovery UX"
```

---

### Task 6: Integrated Verification and Docker Rebuild

**Files:**
- No source files expected.

**Interfaces:**
- Verifies vendor list, manager payment recovery, tenant payment recovery, API authorization, and Docker runtime as one release candidate.

- [ ] **Step 1: Run focused vendor, manager, tenant, and API tests**

Expected: all newly added and modified focused suites PASS.

- [ ] **Step 2: Run repository verification**

```bash
bash scripts/verify.sh
```

Expected: types, UI, web, API builds and API smoke PASS.

- [ ] **Step 3: Run full web and API suites**

```bash
pnpm test:web
pnpm test:api
```

Record unrelated pre-existing failures separately; do not change unrelated listing, messaging, OCR, or ticket UI to force a pass.

- [ ] **Step 4: Rebuild Docker and verify runtime**

```bash
docker compose -p roomlog up -d --build web
docker compose -p roomlog ps -a
curl -fsS http://localhost:4000/api/health
```

Expected: migration exits 0, postgres healthy, API and web up, health returns 200.

- [ ] **Step 5: Review final diff and status**

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected: clean worktree after the two implementation commits. Do not push.
