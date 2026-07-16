# Manager Credit Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Toss 결제위젯 키로 관리자 크레딧 충전을 완료하고 실패한 준비 주문을 정리한다.

**Architecture:** `toss-payments.ts`의 공통 키 분기를 관리자 충전에서도 사용한다. `ManagerCreditUtility`는 주문 준비와 결제 요청을 분리하고 위젯 키일 때만 팝업 내부에 결제수단·약관을 렌더한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Toss Payments v2 SDK, Node test runner

## Global Constraints

- 기존 `NEXT_PUBLIC_TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY`를 그대로 사용한다.
- raw hex를 추가하지 않고 기존 디자인 토큰만 사용한다.
- API·스키마·세입자 결제 흐름은 변경하지 않는다.
- 결제창 키 방식의 기존 동작을 유지한다.

---

### Task 1: Toss 관리자 요청 분기

**Files:**
- Create: `apps/web/src/lib/toss-payments.spec.ts`
- Modify: `apps/web/src/lib/toss-payments.ts`

**Interfaces:**
- Consumes: `TossPaymentRequest`, `TossWidgets`, `tossPaymentMode()`
- Produces: 위젯 또는 결제창으로 분기하는 `requestManagerCardPayment()`

- [x] **Step 1: 위젯 키가 widgets.requestPayment를 사용한다는 실패 테스트 작성**
- [x] **Step 2: `pnpm --filter web test:unit -- toss-payments.spec.ts`로 예상 실패 확인**
- [x] **Step 3: `requestManagerCardPayment()`가 공통 `requestTossPayment()`를 사용하도록 최소 수정**
- [x] **Step 4: 위젯·결제창 두 테스트 통과 확인**

### Task 2: 관리자 팝업 위젯 단계

**Files:**
- Modify: `apps/web/src/app/manager/manager-credit-shell.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerCreditUtility.tsx`
- Modify: `apps/web/src/app/manager/_components/ManagerCreditUtility.module.css`

**Interfaces:**
- Consumes: `createTossWidgets()`, `tossPaymentMode()`, `requestManagerCardPayment()`
- Produces: 금액 준비 단계와 위젯 결제 단계가 있는 관리자 충전 팝업

- [x] **Step 1: 위젯 컨테이너·키 분기·취소 API 계약의 실패 테스트 작성**
- [x] **Step 2: 집중 테스트가 누락된 계약 때문에 실패하는지 확인**
- [x] **Step 3: 주문 준비, 위젯 렌더, 결제 요청 상태를 분리해 구현**
- [x] **Step 4: 위젯 실패·팝업 취소 시 READY 주문 취소 구현**
- [x] **Step 5: 토큰 기반 위젯 영역·2단계 버튼 스타일 추가**
- [x] **Step 6: 집중 테스트 통과 확인**

### Task 3: 통합 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: 완성된 관리자 충전 흐름
- Produces: 로컬에서 확인 가능한 Docker 화면

- [x] **Step 1: `pnpm --filter web test` 실행**
- [x] **Step 2: `pnpm --filter web build` 실행**
- [x] **Step 3: `docker compose -p roomlog up -d --build api web` 실행**
- [x] **Step 4: 컨테이너 환경변수·API health 확인**
- [x] **Step 5: 브라우저에서 결제수단·약관 렌더 확인 후 결제는 승인하지 않고 종료**
- [x] **Step 6: 변경사항과 검증 결과를 하나의 focused commit으로 정리**
