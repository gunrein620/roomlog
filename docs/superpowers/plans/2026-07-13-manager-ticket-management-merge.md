# Manager Ticket Management Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 `민원·하자` 메뉴에서 기존 통계 대시보드는 유지하고 `민원 대응`과 `하자 관리`를 전체 유형을 다루는 `민원/하자 관리` 메뉴로 통합한다.

**Architecture:** 기존 단일 대시보드 라우트와 두 화면 컴포넌트를 재사용한다. 순수 함수가 URL 쿼리를 `dashboard`, `management`, `complaint`, `defect` 화면 상태로 해석하고, 페이지와 사이드바가 같은 의미를 사용하도록 해 기본 대시보드와 통합 관리 메뉴의 활성 상태 충돌을 막는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, pnpm

## Global Constraints

- `민원 대시보드`는 `/manager/ticket/dash/00`과 기존 `ComplaintDashboard`를 그대로 유지한다.
- `민원/하자 관리`는 `/manager/ticket/dash/00?view=management`에서 민원과 하자 전체를 표시한다.
- 기존 `type=complaint`와 `type=defect` 직접 주소는 필터된 관리 테이블로 계속 동작한다.
- 통합 관리 테이블의 기존 유형 필터를 유지한다.
- API, 공유 타입, 데이터 저장, Docker, 배포 설정은 수정하지 않는다.
- 스타일을 수정하게 되면 `packages/ui/src/tokens.css`의 기존 CSS 변수만 사용하고 raw hex를 추가하지 않는다.

---

### Task 1: 민원/하자 관리 메뉴와 화면 상태 통합

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-view.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-view.spec.ts`
- Modify: `apps/web/src/lib/manager-navigation.ts`
- Modify: `apps/web/src/lib/manager-navigation.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

**Interfaces:**
- Produces: `resolveTicketDashboardView(params: { type?: string; view?: string }): "dashboard" | "management" | "complaint" | "defect"`
- Consumes: `ManagerDefectDashboard`의 기존 `initialTemplate?: "all" | "complaint" | "defect"`
- Produces: 관리자 사이드바 하위 메뉴 `민원 대시보드`, `민원/하자 관리`

- [ ] **Step 1: URL 화면 상태와 내비게이션의 실패 테스트 작성**

`ticket-dashboard-view.spec.ts`에 다음 계약을 추가한다.

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTicketDashboardView } from "./ticket-dashboard-view";

describe("ticket dashboard view", () => {
  it("keeps the default route on the complaint dashboard", () => {
    assert.equal(resolveTicketDashboardView({}), "dashboard");
  });

  it("opens the combined management table for the management view", () => {
    assert.equal(resolveTicketDashboardView({ view: "management" }), "management");
  });

  it("preserves legacy type-filtered management links", () => {
    assert.equal(resolveTicketDashboardView({ type: "complaint" }), "complaint");
    assert.equal(resolveTicketDashboardView({ type: "defect" }), "defect");
  });
});
```

`manager-navigation.spec.ts`의 티켓 메뉴 계약을 다음 기대로 바꾼다.

```ts
assert.deepEqual(ticket?.children.map((child) => child.label), [
  "민원 대시보드",
  "민원/하자 관리",
]);
assert.equal(
  ticket?.children.find((child) => child.label === "민원/하자 관리")?.href,
  "/manager/ticket/dash/00?view=management",
);
assert.equal(
  ticket?.children.find((child) => child.label === "민원/하자 관리")?.ticketView,
  "management",
);
```

`manager-defect-dashboard.spec.ts`는 통합 화면 제목과 페이지의 순수 함수 사용을 요구한다.

```ts
assert.match(dashboardSource, /"민원\/하자 관리"/);
assert.match(pageSource, /resolveTicketDashboardView/);
assert.match(navigationSource, /민원\/하자 관리/);
assert.doesNotMatch(navigationSource, /label: "민원 대응"/);
assert.doesNotMatch(navigationSource, /label: "하자 관리"/);
```

- [ ] **Step 2: 관련 테스트를 실행해 RED 확인**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/ticket/dash/00/ticket-dashboard-view.spec.ts \
  src/lib/manager-navigation.spec.ts \
  src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
```

Expected: 새 `ticket-dashboard-view` 모듈 부재 또는 기존 세 개 메뉴 기대 불일치로 FAIL.

- [ ] **Step 3: 최소 구현 작성**

`ticket-dashboard-view.ts`를 추가한다.

```ts
export type TicketDashboardView = "dashboard" | "management" | "complaint" | "defect";

export function resolveTicketDashboardView(params: { type?: string; view?: string }): TicketDashboardView {
  if (params.type === "complaint" || params.type === "defect") return params.type;
  if (params.view === "management") return "management";
  return "dashboard";
}
```

`manager-navigation.ts`의 자식 계약과 티켓 메뉴를 다음처럼 바꾼다.

```ts
export type ManagerTicketView = "dashboard" | "management";

export interface ManagerNavChild {
  label: string;
  href: string;
  demo?: true;
  active?: boolean;
  ticketView?: ManagerTicketView;
}

children: [
  {
    label: "민원 대시보드",
    href: MANAGER_TICKET_ROUTES["M-DASH-00"],
    ticketView: "dashboard",
  },
  {
    label: "민원/하자 관리",
    href: `${MANAGER_TICKET_ROUTES["M-DASH-00"]}?view=management`,
    ticketView: "management",
  },
],
```

`ManagerSidebar.tsx`는 `searchParams`로 현재 티켓 화면을 계산한다. `type=complaint|defect`도 관리 메뉴를 활성화한다.

```ts
const ticketView = searchParams.get("type") === "complaint" || searchParams.get("type") === "defect"
  ? "management"
  : searchParams.get("view") === "management"
    ? "management"
    : "dashboard";

const childActive = child.ticketView
  ? child.ticketView === ticketView
  : child.active ?? currentHref === child.href;
```

`page.tsx`는 화면 상태를 해석해 컴포넌트를 선택한다.

```tsx
type SearchParams = Promise<{ type?: string; view?: string }>;

const dashboardView = resolveTicketDashboardView(await searchParams);
const rows = await listManagerTicketRows();

if (dashboardView === "dashboard") return <ComplaintDashboard rows={rows} />;

const initialTemplate = dashboardView === "management" ? "all" : dashboardView;
return <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />;
```

`ManagerDefectDashboard.tsx`의 `initialTemplate === "all"` 제목을 `민원/하자 관리`로 바꾼다.

- [ ] **Step 4: 관련 테스트를 실행해 GREEN 확인**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/ticket/dash/00/ticket-dashboard-view.spec.ts \
  src/lib/manager-navigation.spec.ts \
  src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
```

Expected: 세 테스트 파일 모두 PASS.

- [ ] **Step 5: web 전체 테스트와 저장소 기본 검증 실행**

Run:

```bash
pnpm test:web
bash scripts/verify.sh
```

Expected: 모든 web 테스트와 types, ui, web, api 빌드 및 API smoke가 PASS. Docker/배포 설정 변경은 없어야 한다.

- [ ] **Step 6: 변경 범위를 검토하고 기능 커밋·푸시**

```bash
git diff --check
git status --short
git add \
  apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-view.ts \
  apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-view.spec.ts \
  apps/web/src/lib/manager-navigation.ts \
  apps/web/src/lib/manager-navigation.spec.ts \
  apps/web/src/app/manager/_components/ManagerSidebar.tsx \
  apps/web/src/app/manager/ticket/dash/00/page.tsx \
  apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts \
  docs/superpowers/plans/2026-07-13-manager-ticket-management-merge.md
git commit -m "feat(manager): unify complaint and defect management"
git push origin kms-complaint1
```

Expected: 기능 파일과 이 계획 문서만 커밋되고 `origin/kms-complaint1` 푸시가 성공한다. 기존의 다른 untracked 설계·계획 문서는 포함하지 않는다.
