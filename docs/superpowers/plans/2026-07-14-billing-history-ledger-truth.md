# Billing History and Truthful Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수금 실적 기간·정렬을 사용자가 제어하게 하고 입출금 원장을 DB 기반 표시 데이터로 교체한다.

**Architecture:** 공유 타입을 좁은 계약으로 먼저 추가하고, RoomlogService가 청구·입금·비용·호실을 결합한 표시 DTO를 만든다. 웹은 해당 DTO만 렌더하며 실적 기간은 URL과 API 쿼리로 유지한다.

**Tech Stack:** TypeScript, Next.js 16 App Router, React, NestJS, Node test runner, CSS Modules, pnpm, Docker Compose

## Global Constraints

- 스타일은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 추가하지 않는다.
- 관리인 셸과 청구수납 바깥 화면은 변경하지 않는다.
- 새 DB 테이블·스키마·마이그레이션을 추가하지 않는다.
- 내부 청구서 ID와 프론트 추론값을 사용자에게 표시하지 않는다.
- 출금 명칭은 유지하고 DB의 확정 비용 원장만 사용한다.
- API 미기동 데모 폴백은 유지하되 `데모 데이터`임을 명시한다.
- 수금 실적은 실제 최초·마지막 기록 월 밖의 0원 월을 생성하지 않는다.
- 입금 상세는 내부 관계 용어를 노출하지 않고 청구 항목을 한 묶음으로 표시한다.
- 기존 dirty worktree의 무관한 파일은 stage·수정하지 않는다.

---

### Task 1: 공유 표시 계약과 순수 정렬 헬퍼

**Files:**
- Modify: `packages/types/src/payment.ts`
- Modify: `apps/web/src/lib/billing-manager-workspace.ts`
- Test: `apps/web/src/lib/billing-manager-workspace.spec.ts`

**Interfaces:**
- Produces: `ManagerCollectionHistoryRange`, `ManagerTransactionLedgerRow`, `ManagerTransactionLedgerData`
- Produces: `collectionPerformanceRows(points, order)`

- [ ] **Step 1: 정렬과 전월 대비 계산의 실패 테스트 작성**

```ts
test("collection performance defaults to recent-first without changing chronological deltas", () => {
  const rows = collectionPerformanceRows(points, "desc");
  assert.deepEqual(rows.map((row) => row.billingMonth), ["2026-03", "2026-02", "2026-01"]);
  assert.equal(rows[0]?.rateDelta, 0.1);
});
```

- [ ] **Step 2: 테스트가 export 부재로 실패하는지 확인**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/billing-manager-workspace.spec.ts`
Expected: FAIL because `collectionPerformanceRows` is not exported.

- [ ] **Step 3: 공유 타입과 최소 헬퍼 구현**

```ts
export type CollectionPerformanceOrder = "desc" | "asc";
export function collectionPerformanceRows(points, order) {
  const chronological = [...points].sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));
  const deltas = new Map(chronological.map((point, index) => [
    point.billingMonth,
    index === 0 ? undefined : point.collectionRate - chronological[index - 1].collectionRate,
  ]));
  return (order === "desc" ? chronological.reverse() : chronological)
    .map((point) => ({ ...point, rateDelta: deltas.get(point.billingMonth) }));
}
```

- [ ] **Step 4: types 빌드와 헬퍼 테스트 확인**

Run: `pnpm --filter @roomlog/types typecheck`
Expected: PASS.

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/billing-manager-workspace.spec.ts`
Expected: PASS.

---

### Task 2: 사용자 지정 수금 실적 범위 API

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: `ManagerCollectionHistoryRange`
- Produces: `getManagerCollection(managerId, building, month, historyFrom, historyTo)`

- [ ] **Step 1: 기본 6개월과 직접 범위 실패 테스트 작성**

```ts
it("returns six months by default and accepts a longer explicit history range", () => {
  const defaultResult = service.getManagerCollection("landlord-demo", building, month);
  assert.equal(defaultResult.trend.length, 6);
  const custom = service.getManagerCollection("landlord-demo", building, month, "2025-07", month);
  assert.equal(custom.trend.length, 13);
  assert.equal(custom.history.appliedFromMonth, "2025-07");
});
```

- [ ] **Step 2: 기존 12개월 고정 동작 때문에 실패하는지 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='six months by default' -r ts-node/register src/roomlog/roomlog.service.spec.ts`
Expected: FAIL with trend length 12 or signature mismatch.

- [ ] **Step 3: 월 범위 검증과 월 열거 구현**

```ts
const from = historyFrom ?? this.shiftBillingMonth(month, -5);
const to = historyTo ?? month;
this.assertBillingMonthRange(from, to, month);
const trend = this.billingMonthsBetween(from, to).map((trendMonth) =>
  this.collectionPointForBills(trendMonth, scopedBills.filter((bill) => bill.billingMonth === trendMonth)),
);
```

- [ ] **Step 4: 컨트롤러 쿼리 전달과 API 테스트 통과 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='six months by default|scoped rolling collection metrics' -r ts-node/register src/roomlog/roomlog.service.spec.ts`
Expected: PASS.

---

### Task 3: DB 기반 입출금 표시 DTO

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: `Deposit`, `Bill`, `BillLineItem`, `Cost`, `Receipt`, `Room`
- Produces: `ledgerRows` on `listManagerBillDeposits()` response

- [ ] **Step 1: 실제 입금·청구 결합과 출금 필터 실패 테스트 작성**

```ts
it("builds ledger rows from stored billing and confirmed cost data", () => {
  const result = service.listManagerBillDeposits("landlord-demo");
  const deposit = result.ledgerRows.find((row) => row.direction === "deposit" && row.linkedBill);
  assert.ok(deposit?.linkedBill?.billingMonth);
  assert.equal(JSON.stringify(deposit).includes("bill-demo"), false);
  assert.equal(result.ledgerRows.some((row) => row.direction === "withdrawal"), true);
  assert.equal(result.ledgerRows.some((row) => row.sourceStatus === "draft"), false);
});
```

- [ ] **Step 2: `ledgerRows` 부재로 실패하는지 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='builds ledger rows' -r ts-node/register src/roomlog/roomlog.service.spec.ts`
Expected: FAIL because `ledgerRows` is missing.

- [ ] **Step 3: 입금 행 조립 구현**

```ts
const linkedBill = deposit.matchedBillId
  ? this.store.bills.find((bill) => bill.id === deposit.matchedBillId)
  : undefined;
return {
  id: deposit.id,
  direction: "deposit",
  occurredAt: deposit.depositedAt,
  amount: deposit.amount,
  depositorName: deposit.depositorName,
  matchStatus: deposit.matchStatus,
  linkedBill: linkedBill ? this.presentManagerLedgerBill(linkedBill, managerId) : undefined,
};
```

- [ ] **Step 4: 확정 비용 출금 행 조립 구현**

```ts
const withdrawals = this.listManagerCosts(managerId)
  .filter((cost) => ["confirmed", "amended"].includes(cost.status))
  .filter((cost) => cost.repairPayment !== "unpaid")
  .map((cost) => this.presentManagerLedgerCost(cost, managerId));
```

- [ ] **Step 5: API 테스트 통과 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='builds ledger rows|seeds manager billing dummy rows' -r ts-node/register src/roomlog/roomlog.service.spec.ts`
Expected: PASS.

---

### Task 4: 웹 매핑과 명시적 데모 출처

**Files:**
- Modify: `apps/web/src/lib/billing-manager-mapping.ts`
- Modify: `apps/web/src/lib/billing-manager-demo.ts`
- Modify: `apps/web/src/lib/billing-manager-api.ts`
- Test: `apps/web/src/app/manager/billing/billing-workspace-redesign.spec.ts`

**Interfaces:**
- Consumes: API `ledgerRows` and collection `history`
- Produces: `ManagerTransactionLedgerData` with `source: "database" | "demo"`

- [ ] **Step 1: 매핑·데모 출처 실패 테스트 작성**

```ts
assert.match(ledgerSource, /data\.source === "demo"/);
assert.doesNotMatch(ledgerSource, /buildWithdrawalRows|leasePeriods|chargeKindFor/);
```

- [ ] **Step 2: 기존 임시 로직 때문에 실패하는지 확인**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts`
Expected: FAIL because inferred ledger helpers still exist.

- [ ] **Step 3: API 성공과 데모 폴백에 출처를 부여**

```ts
return { source: "database", rows: data.ledgerRows?.map(toManagerLedgerRow) ?? [] };
// catch: return { ...DEMO_TRANSACTION_LEDGER, source: "demo" };
```

- [ ] **Step 4: 매핑 타입검사 확인**

Run: `pnpm --filter web build`
Expected: PASS.

---

### Task 5: 수금 실적 기간·정렬 UI

**Files:**
- Modify: `apps/web/src/app/manager/billing/collection/page.tsx`
- Modify: `apps/web/src/app/manager/billing/CollectionWorkspace.tsx`
- Modify: `apps/web/src/app/manager/billing/billing-workspace.module.css`
- Modify: `apps/web/src/lib/billing-manager-api.ts`
- Test: `apps/web/src/app/manager/billing/billing-workspace-redesign.spec.ts`

**Interfaces:**
- Consumes: collection `history`, URL `historyFrom`, `historyTo`, `order`
- Consumes: `collectionPerformanceRows`

- [ ] **Step 1: 3·6·12개월, 직접 설정, 최근순 실패 테스트 작성**

```ts
assert.match(collectionSource, /3개월/);
assert.match(collectionSource, /6개월/);
assert.match(collectionSource, /12개월/);
assert.match(collectionSource, /직접 설정/);
assert.match(collectionSource, /collectionPerformanceRows/);
assert.match(styleSource, /\.monthlyPerformanceViewport[\s\S]*overflow-y:\s*auto/);
```

- [ ] **Step 2: 컨트롤 부재로 실패하는지 확인**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts`
Expected: FAIL.

- [ ] **Step 3: URL 유지 기간 컨트롤과 직접 월 입력 구현**

```ts
function applyRange(from: string, to: string) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("historyFrom", from);
  next.set("historyTo", to);
  router.push(`${pathname}?${next.toString()}`, { scroll: false });
}
```

- [ ] **Step 4: 최근순·과거순과 고정 높이 표 구현**

```css
.monthlyPerformanceViewport {
  max-height: calc(var(--touch-target) * 7);
  overflow: auto;
  scrollbar-gutter: stable;
}
.monthlyPerformanceTable th { position: sticky; top: 0; z-index: 1; }
```

- [ ] **Step 5: 웹 대상 테스트 통과 확인**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts src/lib/billing-manager-workspace.spec.ts`
Expected: PASS.

---

### Task 6: 입출금 원장 UI를 표시 DTO로 교체

**Files:**
- Modify: `apps/web/src/app/manager/billing/matching/page.tsx`
- Modify: `apps/web/src/app/manager/billing/matching/ManagerTransactionLedger.tsx`
- Modify: `apps/web/src/app/manager/billing/matching/manager-transaction-ledger.module.css`
- Test: `apps/web/src/app/manager/billing/billing-workspace-redesign.spec.ts`

**Interfaces:**
- Consumes: `ManagerTransactionLedgerData`
- Removes: `buildLedgerRows`, `buildWithdrawalRows`, `buildingFor`, `chargeKindFor`, `splitAmount`, fixed lease periods and generated memo

- [ ] **Step 1: 내부 ID·추론 로직 제거 실패 테스트 작성**

```ts
assert.doesNotMatch(ledgerSource, /matchedBillId\s*\?\?|buildWithdrawalRows|leasePeriods|buildingFor|chargeKindFor|memoFor/);
assert.match(ledgerSource, /청구 내역/);
assert.match(ledgerSource, /확정 비용 원장/);
```

- [ ] **Step 2: 기존 소스 때문에 실패하는지 확인**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts`
Expected: FAIL.

- [ ] **Step 3: API 표시 DTO 기반 필터·표·상세 구현**

```tsx
{row.linkedBill ? (
  <span><strong>청구 내역</strong> {monthLabel(row.linkedBill.billingMonth)} · {row.linkedBill.items.map(formatBillItem).join(" · ")}</span>
) : (
  <span><strong>청구 내역</strong> 확인 필요</span>
)}
```

- [ ] **Step 4: 데모 배너와 실제 빈 상태 구현**

```tsx
{data.source === "demo" ? <p className={styles.demoNotice}>데모 데이터</p> : null}
```

- [ ] **Step 5: 웹 테스트와 타입검사 통과 확인**

Run: `pnpm test:web`
Expected: billing tests pass; unrelated pre-existing failures are recorded separately.

---

### Task 7: 전체 검증과 Docker 재빌드

**Files:**
- Verify only; do not stage unrelated files.

**Interfaces:**
- Consumes: all tasks above
- Produces: locally running `roomlog-web`, `roomlog-api`, `roomlog-postgres`

- [ ] **Step 1: 공유 타입·API·웹 빌드**

Run: `pnpm --filter @roomlog/types typecheck && pnpm --filter api build && pnpm --filter web build`
Expected: all exit 0.

- [ ] **Step 2: API와 청구수납 대상 테스트**

Run: `pnpm --filter api exec node --test -r ts-node/register src/roomlog/roomlog.service.spec.ts`
Expected: PASS.

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts src/app/manager/billing/overdue-workspace.spec.ts src/lib/billing-manager-workspace.spec.ts`
Expected: PASS.

- [ ] **Step 3: Docker 이미지 재빌드와 실행**

Run: `docker compose up -d --build api web`
Expected: web and api images build, containers start, postgres stays healthy.

- [ ] **Step 4: 상태·로그·diff 확인**

Run: `docker compose ps`
Expected: `roomlog-web` and `roomlog-api` Up, `roomlog-postgres` healthy.

Run: `git diff --check`
Expected: no output.

---

### Task 8: 실적 시작 월과 입금 상세 표현 보정

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/web/src/lib/billing-manager-demo.ts`
- Modify: `apps/web/src/app/manager/billing/CollectionWorkspace.tsx`
- Modify: `apps/web/src/app/manager/billing/matching/ManagerTransactionLedger.tsx`
- Test: `apps/web/src/app/manager/billing/billing-workspace-redesign.spec.ts`

**Interfaces:**
- Keeps: `getManagerCollection(managerId, building, month, historyFrom, historyTo)`
- Produces: 기본 조회 시 `max(최초 기록 월, 선택 월 - 5개월)`부터 `min(마지막 기록 월, 선택 월)`까지의 추세
- Produces: `formatBillingDate(value)`와 단일 `청구 내역` 표시

- [ ] **Step 1: 기록 시작 전 월과 내부 상세 용어를 잡는 실패 테스트 작성**

```ts
assert.equal(result.trend.length, 2);
assert.equal(result.history.appliedFromMonth, previousMonth);
assert.doesNotMatch(ledgerSource, /연결 청구|청구 구성/);
assert.match(ledgerSource, /청구 내역/);
assert.match(ledgerSource, /formatBillingDate\(bill\.dueDate\)/);
```

- [ ] **Step 2: 테스트가 기존 6개월 강제 생성과 기존 문구 때문에 실패하는지 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='starts collection history at the first recorded month' -r ts-node/register src/roomlog/roomlog.service.spec.ts`

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/billing/billing-workspace-redesign.spec.ts`

Expected: API는 6행을 반환하고 웹 소스에는 `연결 청구`, 반복 `청구 구성`, 원본 `bill.dueDate`가 남아 있어 FAIL.

- [ ] **Step 3: API와 데모의 적용 범위를 실제 기록 경계로 자르기**

```ts
const appliedFromMonth = availableFromMonth
  ? maxMonth(requestedFromMonth, availableFromMonth)
  : month;
const appliedToMonth = availableToMonth
  ? minMonth(requestedToMonth, availableToMonth)
  : month;
const trend = availableFromMonth && appliedFromMonth <= appliedToMonth
  ? this.billingMonthsBetween(appliedFromMonth, appliedToMonth).map(toPoint)
  : [];
```

- [ ] **Step 4: 입금 상세를 한 번의 청구 내역과 날짜 전용 표시로 변경**

```tsx
<span>
  <strong>청구 내역</strong>
  {formatMonth(bill.billingMonth)} · {bill.items.map(formatBillItem).join(" · ")}
</span>
<span><strong>납부기한</strong> {formatBillingDate(bill.dueDate)}</span>
<span><strong>청구금액</strong> {formatWon(bill.totalAmount)}</span>
<span><strong>납부금액</strong> {formatWon(bill.paidAmount)}</span>
```

- [ ] **Step 5: 대상 테스트·웹 빌드·Docker web/api 재빌드 확인**

Run: `pnpm --filter api exec node --test --test-name-pattern='collection history|ledger rows' -r ts-node/register src/roomlog/roomlog.service.spec.ts`

Run: `pnpm --filter web run test:unit`

Run: `pnpm --filter api build && pnpm --filter web build`

Run: `docker compose up -d --build api web && docker compose ps`

Expected: 청구수납 대상 테스트와 빌드가 통과하고 web/api 컨테이너가 Up 상태.
