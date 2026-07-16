# Manager Credit Toss Dialog Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toss 결제 iframe이 열릴 때 관리자 크레딧 충전 다이얼로그를 안전하게 닫고, 요청 취소·오류 시 복구한다.

**Architecture:** 결제 SDK 호출과 다이얼로그 닫기의 순서를 보장하는 작은 순수 헬퍼를 추가한다. `ManagerCreditUtility`의 결제위젯·직접 결제창 경로가 헬퍼를 공유하고, 기존 주문 정리 후 다이얼로그를 다시 여는 오류 흐름을 유지한다.

**Tech Stack:** TypeScript, React 19, Next.js 16, Node test runner, Toss Payments JavaScript SDK v2

## Global Constraints

- Toss iframe 내부 디자인은 변경하지 않는다.
- 결제 주문, 금액, 콜백과 서버 승인 흐름은 변경하지 않는다.
- SDK 요청 전에 충전 다이얼로그를 닫지 않는다.
- 결제 요청 중 컴포넌트와 위젯 DOM을 언마운트하지 않는다.
- raw hex 색상은 추가하지 않는다.

---

### Task 1: 결제창 전환 순서와 오류 복구

**Files:**
- Create: `apps/web/src/app/manager/_components/manager-credit-payment-dialog-transition.ts`
- Create: `apps/web/src/app/manager/_components/manager-credit-payment-dialog-transition.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerCreditUtility.tsx`
- Test: `apps/web/src/app/manager/manager-credit-shell.spec.ts`

**Interfaces:**
- Consumes: `requestPayment: () => Promise<void>`, `closeDialog: () => void`
- Produces: `launchTossPaymentOutsideDialog(requestPayment, closeDialog): Promise<void>`

- [ ] **Step 1: 결제 요청이 먼저 시작되고 다이얼로그가 그다음 닫히는 실패 테스트 작성**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { launchTossPaymentOutsideDialog } from "./manager-credit-payment-dialog-transition";

describe("manager credit Toss dialog transition", () => {
  it("starts the SDK request before closing the host dialog", async () => {
    const events: string[] = [];

    await launchTossPaymentOutsideDialog(
      async () => { events.push("request"); },
      () => { events.push("close"); },
    );

    assert.deepEqual(events, ["request", "close"]);
  });

  it("keeps the host dialog open when starting the SDK throws synchronously", () => {
    const events: string[] = [];

    assert.throws(() => launchTossPaymentOutsideDialog(
      () => { events.push("request"); throw new Error("SDK start failed"); },
      () => { events.push("close"); },
    ), /SDK start failed/);
    assert.deepEqual(events, ["request"]);
  });
});
```

`manager-credit-shell.spec.ts`에는 `ManagerCreditUtility`가 헬퍼를 사용하고, 결제 요청 실패 정리 후 `dialogRef.current?.showModal()`로 복구하는 소스 계약을 추가한다.

- [ ] **Step 2: 테스트를 실행해 구현 부재로 실패하는지 확인**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/manager-credit-payment-dialog-transition.spec.ts \
  src/app/manager/manager-credit-shell.spec.ts
```

Expected: `manager-credit-payment-dialog-transition` 모듈 부재 또는 헬퍼 사용 계약 불일치로 FAIL.

- [ ] **Step 3: 최소 전환 헬퍼 구현**

```ts
export function launchTossPaymentOutsideDialog(
  requestPayment: () => Promise<void>,
  closeDialog: () => void,
): Promise<void> {
  const pendingPayment = requestPayment();
  closeDialog();
  return pendingPayment;
}
```

- [ ] **Step 4: 두 결제 경로에 헬퍼와 오류 복구 연결**

결제위젯 경로는 다음 구조를 사용한다.

```ts
await launchTossPaymentOutsideDialog(
  () => requestManagerCardPayment({
    clientKey: currentCheckout.clientKey,
    customerKey: currentCheckout.customerKey,
    orderId: currentCheckout.order.orderId,
    amount: currentCheckout.order.amount,
    orderName: currentCheckout.orderName,
    successUrl: `${window.location.origin}/manager/credit-topup/success`,
    failUrl: `${window.location.origin}/manager/credit-topup/fail`,
    widgets,
  }),
  () => dialogRef.current?.close(),
);
```

직접 결제창 경로는 다음 구조를 사용한다.

```ts
await launchTossPaymentOutsideDialog(
  () => requestManagerCardPayment({
    clientKey: createdCheckout.clientKey,
    customerKey: createdCheckout.customerKey,
    orderId: createdCheckout.order.orderId,
    amount: createdCheckout.order.amount,
    orderName: createdCheckout.orderName,
    successUrl: `${window.location.origin}/manager/credit-topup/success`,
    failUrl: `${window.location.origin}/manager/credit-topup/fail`,
  }),
  () => dialogRef.current?.close(),
);
```

각 catch 블록은 기존 READY 주문 취소와 오류 상태 갱신 뒤 다음을 호출한다.

```ts
setSubmitting(false);
dialogRef.current?.showModal();
```

- [ ] **Step 5: 집중 테스트와 웹 빌드 실행**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/manager-credit-payment-dialog-transition.spec.ts \
  src/app/manager/manager-credit-shell.spec.ts \
  src/lib/toss-payments.spec.ts
cd ../..
pnpm --filter web build
```

Expected: 모든 집중 테스트 PASS, Next.js 프로덕션 빌드 exit 0.

- [ ] **Step 6: 전체 검증과 Docker 재빌드**

Run:

```bash
pnpm test:web
bash scripts/verify.sh
docker compose -p roomlog up -d --build web
docker compose -p roomlog ps
```

Expected: 웹 테스트와 기본 검증 0 failures, `roomlog-web`과 `roomlog-api`가 Up, PostgreSQL이 healthy.

- [ ] **Step 7: 구현 커밋**

```bash
git add \
  apps/web/src/app/manager/_components/manager-credit-payment-dialog-transition.ts \
  apps/web/src/app/manager/_components/manager-credit-payment-dialog-transition.spec.ts \
  apps/web/src/app/manager/_components/ManagerCreditUtility.tsx \
  apps/web/src/app/manager/manager-credit-shell.spec.ts
git commit -m "fix(payment): remove nested Toss dialog backdrop"
```
