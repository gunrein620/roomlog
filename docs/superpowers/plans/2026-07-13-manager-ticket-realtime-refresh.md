# Manager Ticket Realtime Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세입자가 민원 또는 하자를 등록하면 열려 있는 관리자 민원/하자 관리 목록을 WebSocket으로 즉시 갱신하고, 연결 장애 시 최대 3초 폴링으로 동기화한다.

**Architecture:** 기존 `RealtimeGateway`의 `roomlog:activity` 신호를 민원 생성 컨트롤러에서 발행한다. 관리자 관리 화면은 전용 클라이언트 컴포넌트로 신호를 구독하고 `router.refresh()`를 호출해 기존 서버 컴포넌트 목록 조회를 재사용하며, 소켓 장애·이벤트 유실에는 폴링과 안전 갱신으로 대응한다.

**Tech Stack:** NestJS 11, Next.js 16 App Router, React 19, Socket.IO, Node test runner, TypeScript

## Global Constraints

- `packages/types` 공유 타입 변경은 필요하지 않다.
- 스타일 변경과 raw hex 추가는 하지 않는다.
- Docker, workflow, env, Socket.IO 인프라 설정 파일은 수정하지 않는다.
- 이벤트에는 민원 데이터 대신 `{ kind: "ticket" }` 변경 신호만 담는다.
- 관리 화면의 기존 URL 쿼리와 클라이언트 필터 상태를 유지한다.
- 기존 미추적 문서는 스테이징하거나 커밋하지 않는다.

---

### Task 1: 민원 생성 성공 이벤트 발행

**Files:**
- Create: `apps/api/src/roomlog/roomlog.controller-realtime.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts:415-433`

**Interfaces:**
- Consumes: `RealtimeGateway.broadcast(event: string, payload: Record<string, unknown>): void`
- Produces: 일반 폼·전화 접수 성공 후 `roomlog:activity` / `{ kind: "ticket" }` 이벤트

- [ ] **Step 1: 컨트롤러 이벤트 계약 실패 테스트 작성**

`roomlog.controller-realtime.spec.ts`에서 `RoomlogService`, broadcast 호출을 기록하는 가짜 `RealtimeGateway`, 로그인한 tenant 헤더로 `RoomlogController`를 구성한다. 일반 접수는 다음 입력을 사용한다.

```ts
controller.createComplaint(header, {
  title: "실시간 목록 검증 누수",
  description: "세면대 아래에서 물이 새고 있습니다.",
  location: "301호 욕실",
  availableTimes: "오늘 오후",
});

assert.deepEqual(broadcasts, [
  { event: "roomlog:activity", payload: { kind: "ticket" } },
]);
```

전화 접수는 `service.createIntakeSession("tenant-demo", { sourceChannel: "CALLBOT" })`로 세션을 만들고 다음 호출 뒤 같은 이벤트 한 건을 검증한다.

```ts
controller.createComplaintFromCall(header, {
  callSessionId: session.id,
  recordingUrl: "https://example.com/realtime-ticket.mp3",
});
```

- [ ] **Step 2: API 대상 테스트를 실행해 RED 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/roomlog.controller-realtime.spec.ts
```

Expected: 민원 생성은 성공하지만 `broadcasts`가 빈 배열이라 두 테스트가 실패한다.

- [ ] **Step 3: 성공 결과 반환 전에 ticket 활동 이벤트 발행**

두 컨트롤러 메서드에서 서비스 결과를 먼저 받은 뒤 이벤트를 발행하고 결과를 반환한다.

```ts
const result = this.roomlogService.createComplaint(user.id, body);
this.realtime.broadcast("roomlog:activity", { kind: "ticket" });
return result;
```

전화 접수도 `createComplaintFromCall` 결과에 동일한 순서를 적용한다. 서비스 호출이 throw하면 broadcast까지 도달하지 않도록 순서를 유지한다.

- [ ] **Step 4: API 대상 및 전체 테스트 실행**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/roomlog.controller-realtime.spec.ts
pnpm test:api
```

Expected: 대상 테스트 2개 통과, API 전체 실패 0개.

- [ ] **Step 5: API 슬라이스 커밋**

```bash
git add apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.controller-realtime.spec.ts
git commit -m "feat(ticket): broadcast complaint activity"
```

---

### Task 2: 관리자 민원/하자 목록 자동 갱신

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/TicketDashboardAutoRefresh.tsx`
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-activity.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-activity.spec.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx:1-24`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

**Interfaces:**
- Consumes: `getRealtimeSocket(): Socket`, `router.refresh(): void`, `roomlog:activity` payload
- Produces: `isTicketActivity(payload: unknown): boolean`, `TicketDashboardAutoRefresh({ intervalMs?: number })`

- [ ] **Step 1: payload 판별과 화면 배선 실패 테스트 작성**

순수 함수 테스트에 다음 계약을 추가한다.

```ts
assert.equal(isTicketActivity({ kind: "ticket" }), true);
assert.equal(isTicketActivity({ kind: "messaging" }), false);
assert.equal(isTicketActivity(null), false);
```

`manager-defect-dashboard.spec.ts`에는 전용 컴포넌트 소스를 읽어 아래 계약을 검증한다.

```ts
assert.match(autoRefreshSource, /getRealtimeSocket/);
assert.match(autoRefreshSource, /isTicketActivity/);
assert.match(autoRefreshSource, /router\.refresh\(\)/);
assert.match(autoRefreshSource, /window\.setInterval/);
assert.match(autoRefreshSource, /30000/);
assert.match(autoRefreshSource, /visibilitychange/);
assert.match(pageSource, /dashboardView === "management"[\s\S]*<TicketDashboardAutoRefresh/);
```

- [ ] **Step 2: Web 대상 테스트를 실행해 RED 확인**

Run:

```bash
pnpm --filter web test:unit -- ticket-dashboard-activity.spec.ts manager-defect-dashboard.spec.ts
```

Expected: 모듈과 컴포넌트가 없어 실패한다.

- [ ] **Step 3: ticket 활동 payload 판별 함수 구현**

```ts
export function isTicketActivity(payload: unknown): payload is { kind: "ticket" } {
  return typeof payload === "object" && payload !== null &&
    (payload as { kind?: unknown }).kind === "ticket";
}
```

- [ ] **Step 4: 관리자 전용 자동 갱신 컴포넌트 구현**

`TicketDashboardAutoRefresh.tsx`는 기존 `MessageAutoRefresh` 패턴을 따르되 이벤트 payload가 `ticket`일 때만 갱신한다.

```ts
const onActivity = (payload: unknown) => {
  if (isTicketActivity(payload)) refreshVisibleDashboard();
};

const fallbackId = window.setInterval(() => {
  if (!isSocketLiveRef.current) refreshVisibleDashboard();
}, intervalMs);
const safetyId = window.setInterval(refreshVisibleDashboard, 30000);
```

`refreshVisibleDashboard`는 문서가 visible이고 현재 focus가 input, textarea, select, contenteditable이 아닐 때만 `router.refresh()`를 호출한다. mount 시 socket connect/disconnect/activity와 window focus/document visibilitychange를 구독하고 cleanup에서 모두 해제한다.

- [ ] **Step 5: 관리 화면에만 컴포넌트 마운트**

`page.tsx`에서 `dashboardView === "dashboard"`는 기존 컴포넌트만 반환한다. 그 외 목록 반환부에서 `dashboardView === "management"`일 때 자동 갱신 컴포넌트를 함께 렌더한다.

```tsx
return (
  <>
    {dashboardView === "management" ? <TicketDashboardAutoRefresh intervalMs={3000} /> : null}
    <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />
  </>
);
```

- [ ] **Step 6: Web 대상·전체 유닛·빌드 테스트 실행**

Run:

```bash
pnpm --filter web test:unit
pnpm --filter web build
```

Expected: Web 유닛 실패 0개, Next 프로덕션 빌드 성공.

- [ ] **Step 7: Web 슬라이스 커밋**

```bash
git add apps/web/src/app/manager/ticket/dash/00/TicketDashboardAutoRefresh.tsx \
  apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-activity.ts \
  apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-activity.spec.ts \
  apps/web/src/app/manager/ticket/dash/00/page.tsx \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
git commit -m "feat(ticket): refresh manager list in realtime"
```

---

### Task 3: 통합 검증과 배포 준비

**Files:**
- Verify only; 인프라 및 소스 변경 없음

**Interfaces:**
- Consumes: 세입자 민원 등록 API, `roomlog:activity`, 관리자 관리 목록
- Produces: Docker와 브라우저 기반 완료 증거

- [ ] **Step 1: 기본 검증 실행**

```bash
bash scripts/verify.sh
```

Expected: types, ui, web, api 빌드와 API 스모크 모두 통과.

- [ ] **Step 2: Docker 이미지 재빌드 및 스택 기동**

```bash
docker compose up -d --build api web
docker compose ps
```

Expected: postgres healthy, api/web up. 인프라 파일은 변경하지 않는다.

- [ ] **Step 3: 브라우저 실시간 흐름 검증**

1. 관리자 세션에서 `/manager/ticket/dash/00?view=management`를 연다.
2. 별도 세입자 세션에서 신규 민원/하자를 접수한다.
3. 관리자 화면을 수동 새로고침하지 않고 신규 행이 표시되는지 확인한다.
4. 유형·상태·담당자·건물 필터가 유지되는지 확인한다.
5. API 로그와 브라우저 오류가 없는지 확인한다.

- [ ] **Step 4: 작업 범위와 Git 상태 확인**

```bash
git diff --check
git status --short --branch
git log --oneline origin/kms-complaint1..HEAD
```

Expected: 이번 설계·계획·API·Web 변경만 tracked 차이에 포함되고 기존 미추적 문서는 그대로 남는다.

- [ ] **Step 5: 현재 브랜치 푸시**

```bash
git push origin kms-complaint1
```

Expected: 현재 브랜치의 신규 커밋이 원격에 fast-forward로 반영된다.
