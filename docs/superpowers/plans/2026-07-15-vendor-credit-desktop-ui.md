# Vendor Credit Desktop UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the manager credit workspace into a compact desktop operations console with separated policy actions and independently scrollable ledger and top-up histories.

**Architecture:** Keep the existing `CreditWorkspace` state, server actions, and view model intact. Change only the component's semantic layout and its CSS module, then lock the approved structure with source-contract tests in the existing web spec.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules, Node test runner

## Global Constraints

- Use `ManagerShell`; do not introduce a mobile `PhoneFrame` or a narrow content wrapper.
- Do not change shared types, API functions, mutations, payment rules, or Toss checkout behavior.
- Use only CSS variables from `packages/ui/src/tokens.css`; raw hex colors are forbidden.
- Preserve demo read-only, busy, success, error, payment confirmation, and pagination behavior.
- Show at most eight ledger or top-up rows before each history region scrolls internally.
- Keep the ledger table header sticky and make both history scroll regions keyboard focusable and labeled.

---

### Task 1: Implement and lock the approved desktop workspace

**Files:**
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx:484-695`

**Interfaces:**
- Consumes: existing `CreditWorkspaceViewResult`, `submitPolicy`, `renderPaymentActions`, history arrays, and mutation handlers.
- Produces: CSS hooks `summaryStrip`, `policyOptions`, `policySettings`, `policyActions`, `policyIndicator`, `requestMain`, `requestAmount`, `historyScroll`, and `topupScroll`.

- [ ] **Step 1: Write the failing desktop-layout contract test**

Add this test to the `manager credit workspace behavior` suite:

```ts
it("uses desktop policy actions and accessible bounded history regions", () => {
  const workspace = source(workspacePath);
  const css = source(cssPath);

  assert.match(workspace, /className=\{styles\.summaryStrip\}/);
  assert.match(workspace, /className=\{styles\.policyOptions\}/);
  assert.match(workspace, /className=\{styles\.policySettings\}/);
  assert.match(workspace, /className=\{styles\.policyActions\}/);
  assert.match(workspace, /className=\{styles\.policyIndicator\}/);
  assert.match(workspace, /className=\{styles\.requestMain\}/);
  assert.match(workspace, /className=\{styles\.requestAmount\}/);
  assert.match(workspace, /className=\{styles\.historyScroll\}/);
  assert.match(workspace, /className=\{styles\.topupScroll\}/);
  assert.match(workspace, /aria-label="크레딧 원장 내역"/);
  assert.match(workspace, /aria-label="크레딧 충전 내역"/);
  assert.equal(workspace.match(/tabIndex=\{0\}/g)?.length, 2);

  assert.match(css, /\.policyActions\s*\{/);
  assert.match(css, /\.historyScroll[\s\S]*?overflow:\s*auto/);
  assert.match(css, /\.topupScroll[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /--history-visible-rows:\s*8/);
  assert.match(css, /max-height:\s*var\(--history-max-height\)/);
  assert.match(css, /\.tableWrap th[\s\S]*?position:\s*sticky/);
});
```

- [ ] **Step 2: Run the focused test and confirm the new contract fails**

Run from the repository root:

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
```

Expected: FAIL in `uses desktop policy actions and accessible bounded history regions` because the new CSS hooks and scroll semantics do not exist.

- [ ] **Step 3: Refactor the summary and policy markup without changing behavior**

Replace the summary section class with `summaryStrip`. Wrap the policy choices, conditional setting, and submit button in independent regions. Keep the same radio values and handler:

```tsx
<section className={styles.summaryStrip} aria-label="크레딧 요약">
  <article className={styles.balanceCard}>
    <div>
      <span>현재 크레딧</span>
      <strong>{won(workspace.account.balance)}</strong>
      <small>최근 갱신 {formatDate(workspace.account.updatedAt)}</small>
    </div>
    <button className={styles.primaryButton} type="button" disabled={demoReadOnly} onClick={() => openManagerCreditTopup()}>
      충전
    </button>
  </article>
  <article className={styles.summaryCard}>
    <span>지급 처리 필요</span>
    <strong>{pendingRequests.length}건</strong>
    <small>승인 대기·잔액 부족 합계 {won(pendingAmount)}</small>
  </article>
  <article className={styles.summaryCard}>
    <span>현재 자동결제 기준</span>
    <strong>{policyModeLabel[workspace.policy.mode]}</strong>
    <small>
      {workspace.policy.mode === "AUTO_DEBIT_UNDER_LIMIT"
        ? `건당 ${won(workspace.policy.perRequestLimit ?? 0)}`
        : "모든 지급을 직접 확인"}
    </small>
  </article>
  {workspaceResult.source === "DEMO" ? (
    <p className={styles.demoNotice}>API 연결이 없어 읽기 화면만 데모 데이터로 표시합니다. 저장·지급 작업은 실제 API 연결이 필요합니다.</p>
  ) : null}
</section>

<form className={styles.policyForm} onSubmit={submitPolicy}>
  <div className={styles.policyOptions} role="radiogroup" aria-label="자동결제 방식">
    <label className={styles.policyOption}>
      <input
        type="radio"
        name="autoPayPolicy"
        value="ALWAYS_REQUIRE_APPROVAL"
        checked={policyMode === "ALWAYS_REQUIRE_APPROVAL"}
        onChange={() => setPolicyMode("ALWAYS_REQUIRE_APPROVAL")}
        disabled={busyKeys.has("policy") || demoReadOnly}
      />
      <span className={styles.policyIndicator} aria-hidden="true" />
      <span>
        <strong>항상 승인 후 결제</strong>
        <small>모든 업체 지급 요청을 관리자가 확인한 뒤 처리합니다.</small>
      </span>
    </label>
    <label className={styles.policyOption}>
      <input
        type="radio"
        name="autoPayPolicy"
        value="AUTO_DEBIT_UNDER_LIMIT"
        checked={policyMode === "AUTO_DEBIT_UNDER_LIMIT"}
        onChange={() => setPolicyMode("AUTO_DEBIT_UNDER_LIMIT")}
        disabled={busyKeys.has("policy") || demoReadOnly}
      />
      <span className={styles.policyIndicator} aria-hidden="true" />
      <span>
        <strong>한도 이하 자동 차감</strong>
        <small>설정 금액 이하의 승인된 지급 요청만 크레딧에서 자동 차감합니다.</small>
      </span>
    </label>
  </div>
  <div className={styles.policySettings}>
    {policyMode === "AUTO_DEBIT_UNDER_LIMIT" ? (
      <label className={styles.limitField}>
        건당 자동 차감 한도
        <span>
          <input type="number" min="1" step="1" value={limitText} onChange={(event) => setLimitText(event.target.value)} disabled={busyKeys.has("policy") || demoReadOnly} />
          원
        </span>
      </label>
    ) : (
      <p>모든 업체 지급 요청을 직접 확인한 뒤 결제합니다.</p>
    )}
  </div>
  <div className={styles.policyActions}>
    <span>{workspace.policy.updatedAt ? `최근 저장 ${formatDate(workspace.policy.updatedAt)}` : "저장된 정책 없음"}</span>
    <button className={styles.primaryButton} type="submit" disabled={busyKeys.has("policy") || demoReadOnly}>
      {busyKeys.has("policy") ? "저장 중" : "정책 저장"}
    </button>
  </div>
</form>
```

- [ ] **Step 4: Refactor each payment request into desktop information columns**

Keep `renderPaymentActions(request, index)` unchanged and replace only the card wrapper structure:

```tsx
<article className={styles.paymentCard} key={request.id}>
  <div className={styles.requestMain}>
    <span className={styles.requestLabel}>{request.vendorName ?? `업체 지급 요청 ${index + 1}`}</span>
    <strong>{[request.roomLabel, request.repairTitle].filter(Boolean).join(" · ") || "수리 작업 정보 확인 필요"}</strong>
    <div className={styles.requestMeta}>
      <span>요청일 {formatDate(request.createdAt)}</span>
      {request.processedAt ? <span>처리일 {formatDate(request.processedAt)}</span> : null}
      {request.failureReason ? <span>{userFacingFailure(request.failureReason)}</span> : null}
    </div>
  </div>
  <div className={styles.requestAmount}>
    <strong>{won(request.amount)}</strong>
    <span className={paymentStatusTone(request.status)}>{paymentStatusLabel[request.status]}</span>
  </div>
  {renderPaymentActions(request, index)}
</article>
```

- [ ] **Step 5: Add accessible history scroll wrappers**

Apply the scroll hooks only to the two approved histories so other tables remain unaffected:

```tsx
<div className={styles.historyScroll} tabIndex={0} aria-label="크레딧 원장 내역">
  <div className={styles.tableWrap}>
    <table>
      <thead><tr><th>일자</th><th>구분</th><th>관련 업무</th><th>변동</th><th>잔액</th></tr></thead>
      <tbody>
        {ledgerEntries.map((entry) => (
          <tr key={entry.rowKey}>
            <td>{formatDate(entry.createdAt)}</td>
            <td>{ledgerTypeLabel[entry.type]}</td>
            <td>{ledgerReferenceLabel(entry.referenceType)}</td>
            <td className={entry.signedAmount >= 0 ? styles.amountPositive : styles.amountNegative}>{signedWon(entry.signedAmount)}</td>
            <td>{won(entry.balanceAfter)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {workspace.nextLedgerCursor ? (
      <button
        className={styles.loadMoreButton}
        type="button"
        disabled={busyKeys.has("history:ledger")}
        onClick={() => void loadMoreHistory("ledger", workspace.nextLedgerCursor!)}
      >
        {busyKeys.has("history:ledger") ? "불러오는 중" : "이전 원장 더 보기"}
      </button>
    ) : null}
  </div>
</div>

<div className={styles.topupScroll} tabIndex={0} aria-label="크레딧 충전 내역">
  <div className={styles.topupList}>
    {topupOrders.map((order) => {
      const key = `topup:${order.orderId}`;
      const reconcilable = order.status === "CONFIRMING"
        || order.status === "RECONCILIATION_REQUIRED";
      return (
        <article className={styles.topupRow} key={order.orderId}>
          <div>
            <strong>{won(order.amount)}</strong>
            <span>{formatDate(order.createdAt)} · {order.method ?? "결제수단 확인 전"}</span>
            {order.failureReason ? <small>{userFacingFailure(order.failureReason)}</small> : null}
          </div>
          <span className={order.status === "APPROVED" ? styles.statusPositive : styles.statusNeutral}>{topupStatusLabel[order.status]}</span>
          {reconcilable ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busyKeys.has(key) || demoReadOnly}
              onClick={() => void runMutation(key, "결제 상태를 다시 확인했습니다.", () => reconcileCreditTopupAction(order.orderId))}
            >
              결제 상태 재확인
            </button>
          ) : null}
        </article>
      );
    })}
    {workspace.nextTopupCursor ? (
      <button
        className={styles.loadMoreButton}
        type="button"
        disabled={busyKeys.has("history:topup")}
        onClick={() => void loadMoreHistory("topup", workspace.nextTopupCursor!)}
      >
        {busyKeys.has("history:topup") ? "불러오는 중" : "이전 충전 내역 더 보기"}
      </button>
    ) : null}
  </div>
</div>
```

- [ ] **Step 6: Implement the summary strip and stable policy action bar**

Use token-only CSS with a connected summary surface and a three-region form:

```css
.workspace {
  display: grid;
  gap: var(--space-lg);
}

.summaryStrip {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) repeat(2, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-container-lowest);
}

.balanceCard,
.summaryCard {
  min-height: calc(var(--touch-target) * 2);
  padding: var(--space-md) var(--space-lg);
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
}

.summaryCard:last-of-type {
  border-right: 0;
}

.policyForm {
  display: grid;
  gap: 0;
  margin: 0 calc(var(--space-lg) * -1) calc(var(--space-lg) * -1);
}

.policyOptions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  padding: 0 var(--space-lg) var(--space-lg);
}

.policyOption {
  position: relative;
  min-height: calc(var(--touch-target) + var(--space-lg));
  display: grid;
  grid-template-columns: var(--control-secondary-size) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-md);
}

.policyOption input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.policyIndicator {
  inline-size: var(--control-secondary-size);
  block-size: var(--control-secondary-size);
  border: 1px solid var(--outline);
  border-radius: var(--radius-full);
  background: var(--surface-container-lowest);
  box-shadow: inset 0 0 0 var(--space-xs) var(--surface-container-lowest);
}

.policyOption:has(input:checked) .policyIndicator {
  border-color: var(--primary);
  background: var(--primary);
}

.policySettings,
.policyActions {
  min-height: calc(var(--touch-target) + var(--space-md));
  display: flex;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--border);
}

.policySettings {
  background: var(--surface-container-low);
}

.policyActions {
  justify-content: space-between;
  gap: var(--space-md);
}
```

- [ ] **Step 7: Implement compact payment columns**

```css
.paymentList {
  gap: var(--space-sm);
}

.paymentCard {
  grid-template-columns: minmax(220px, 1.1fr) minmax(150px, .45fr) minmax(360px, 1.8fr);
  align-items: start;
  gap: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
}

.requestMain,
.requestAmount {
  display: grid;
  gap: var(--space-xs);
}

.requestAmount {
  justify-items: end;
  text-align: right;
}

.requestControls {
  grid-template-columns: minmax(180px, .7fr) minmax(0, 1.3fr);
  align-items: end;
}

.requestActions {
  align-items: end;
}

.directPaymentFields {
  grid-template-columns: minmax(170px, .8fr) minmax(220px, 1.2fr);
}
```

- [ ] **Step 8: Bound both histories to eight visible rows and keep the ledger header sticky**

```css
.historyGrid {
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, .75fr);
}

.historyGrid > .panel {
  align-content: start;
}

.historyScroll,
.topupScroll {
  --history-visible-rows: 8;
  --history-max-height: calc(
    var(--touch-target) + var(--touch-target) + var(--touch-target) + var(--touch-target)
    + var(--touch-target) + var(--touch-target) + var(--touch-target) + var(--touch-target)
    + var(--space-xxl)
  );
  max-height: var(--history-max-height);
  scrollbar-gutter: stable;
}

.historyScroll {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.topupScroll {
  overflow-y: auto;
  padding-right: var(--space-xs);
}

.historyScroll:focus-visible,
.topupScroll:focus-visible {
  outline: 0;
  box-shadow: var(--focus-ring);
}

.tableWrap {
  overflow: visible;
  border: 0;
  border-radius: 0;
}

.tableWrap th {
  position: sticky;
  top: 0;
  z-index: 1;
}

.tableWrap th,
.tableWrap td {
  padding: var(--space-sm) var(--space-md);
}

.topupRow {
  min-height: var(--touch-target);
  padding: var(--space-sm) 0;
}
```

- [ ] **Step 9: Add responsive fallbacks without reintroducing mobile-first spacing**

```css
@media (max-width: 1180px) {
  .historyGrid {
    grid-template-columns: minmax(0, 1fr);
  }

  .paymentCard {
    grid-template-columns: minmax(0, 1fr) minmax(150px, .4fr);
  }

  .requestControls {
    grid-column: 1 / -1;
  }
}

@media (max-width: 900px) {
  .summaryStrip,
  .policyOptions,
  .paymentCard,
  .requestControls {
    grid-template-columns: minmax(0, 1fr);
  }

  .balanceCard,
  .summaryCard {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .requestAmount {
    justify-items: start;
    text-align: left;
  }
}
```

- [ ] **Step 10: Run the focused test and confirm it passes**

```bash
pnpm --filter web exec node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
```

Expected: all tests in `credit-workspace.spec.ts` PASS.

- [ ] **Step 11: Commit the desktop credit workspace implementation**

```bash
git add apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts \
  apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx \
  apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css
git commit -m "feat: refine desktop credit workspace"
```

### Task 2: Run full web and visual verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed credit workspace.
- Produces: test, build, and browser evidence that the approved UI works without regressions.

- [ ] **Step 1: Run all web unit tests**

```bash
pnpm test:web
```

Expected: property shell and all TypeScript unit specs PASS.

- [ ] **Step 2: Build the web app**

```bash
pnpm build:web
```

Expected: Next.js production build completes successfully.

- [ ] **Step 3: Rebuild the standard Docker web service**

```bash
docker compose up -d --build web
```

Expected: the `web` service is rebuilt and running on port 3000.

- [ ] **Step 4: Visually inspect the desktop route**

Open `http://localhost:3000/manager/vendor-mgmt/credit` at a desktop viewport and verify:

- the summary reads as one compact strip;
- policy options have a clear selected state;
- the policy save button stays in the panel footer when the limit field appears or disappears;
- payment request columns remain aligned;
- ledger and top-up histories scroll independently after eight rows;
- the ledger header remains visible while its body scrolls;
- no raw colors, overflow clipping, or focus loss is visible.

- [ ] **Step 5: Check the final diff and working tree**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted task files.

### Task 3: Reduce the policy selection indicator to 20px

**Files:**
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts`
- Modify: `apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css:185-236`

**Interfaces:**
- Consumes: existing `policyOption` label and visually hidden native radio input.
- Produces: a 20px `policyIndicator` while preserving the full option-card click target.

- [ ] **Step 1: Write the failing indicator-size contract**

Add these assertions to `separates desktop policy choices, settings, and actions`:

```ts
assert.match(
  css,
  /\.policyOption[\s\S]*?grid-template-columns:\s*calc\(var\(--space-lg\)\s*\+\s*var\(--space-xs\)\)\s+minmax\(0,\s*1fr\)/,
);
assert.match(
  css,
  /\.policyIndicator[\s\S]*?inline-size:\s*calc\(var\(--space-lg\)\s*\+\s*var\(--space-xs\)\)[\s\S]*?block-size:\s*calc\(var\(--space-lg\)\s*\+\s*var\(--space-xs\)\)/,
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```bash
node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
```

Expected: FAIL because the policy grid and indicator still use `var(--control-secondary-size)` (44px).

- [ ] **Step 3: Implement the 20px token-composed indicator**

```css
.policyOption {
  grid-template-columns: calc(var(--space-lg) + var(--space-xs)) minmax(0, 1fr);
}

.policyIndicator {
  inline-size: calc(var(--space-lg) + var(--space-xs));
  block-size: calc(var(--space-lg) + var(--space-xs));
}
```

Do not change `policyOption` minimum height, padding, label, or hidden native input; the complete card remains the click target.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test -r ts-node/register src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts
```

Expected: all credit workspace tests PASS.

- [ ] **Step 5: Run web tests and production build**

```bash
pnpm test:web
pnpm build:web
```

Expected: all web tests PASS and the Next.js production build succeeds.

- [ ] **Step 6: Commit the size adjustment**

```bash
git add apps/web/src/app/manager/vendor-mgmt/credit/credit-workspace.spec.ts \
  apps/web/src/app/manager/vendor-mgmt/credit/CreditWorkspace.module.css
git commit -m "fix: reduce credit policy indicator"
```
