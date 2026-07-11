# Manager Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 관리자 데스크톱 화면에 공통 왼쪽 사이드바를 적용하고, `/manager/home/00`을 우측 AI 비서가 있는 통합 대시보드로 개편한다.

**Architecture:** `@roomlog/ui`의 `ManagerShell`은 경로를 모르는 3열 레이아웃 슬롯만 제공하고, 웹 앱의 `ManagerAppShell`이 중앙화된 메뉴 모델·사이드바·AI 패널을 조합한다. 대시보드는 기존 매물·계약·티켓·청구 원천을 독립 상태로 합치며, AI 질문은 실시간 에이전트 화면에 미리 채우기만 하고 자동 실행하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Node test runner, `@roomlog/ui`, Lucide React, CSS custom properties, Docker Compose.

## Global Constraints

- 개발·테스트 표준 환경은 local Docker Compose이며 web은 `:3000`, api는 `:4000`을 사용한다.
- 관리자 데스크톱만 개편하고 `/manager/vox/*`, `/manager/ticket/call/*`, 로그인 화면은 기존 `PhoneFrame`·표면을 유지한다.
- 신규 스타일의 색상·간격은 `packages/ui/src/tokens.css` 의미 토큰을 사용한다. 신규 TSX/CSS에 raw hex, 임의 RGB/RGBA, 그라데이션을 추가하지 않는다.
- 별도 애니메이션을 추가하지 않는다.
- API 실패, 실제 빈 목록, 명시적 데모 폴백을 구분하며 실패를 `0`으로 바꾸지 않는다.
- 계약 확정·결제·독촉·발송은 AI가 완료했다고 표현하지 않고 원천 화면에서 사용자가 확인한다.
- 기존 관리자 URL과 계약 상세·계약 스레드 세입자 채팅 동작을 보존한다.
- 새 백엔드 API, 데이터베이스 테이블, 인증 체계는 추가하지 않는다.
- 구현은 RED → GREEN → REFACTOR 순서를 지키며 각 작업마다 집중 테스트를 먼저 실패시킨다.

---

## File Map

### New files

- `apps/web/src/lib/billing-manager-nav.ts`: 청구 정적·동적 경로의 단일 소스.
- `apps/web/src/lib/manager-navigation.ts`: 전역 메뉴 모델과 현재 경로 판정 순수 함수.
- `apps/web/src/lib/manager-navigation.spec.ts`: 메뉴 포함 범위와 동적 상세 제외 테스트.
- `apps/web/src/lib/manager-assistant.ts`: AI 프롬프트 정규화 및 실시간 에이전트 href 생성.
- `apps/web/src/lib/manager-assistant.spec.ts`: 프롬프트 공백·길이·인코딩 테스트.
- `apps/web/src/lib/manager-dashboard.ts`: 대시보드 데이터 상태, KPI, AI 브리핑 순수 모델.
- `apps/web/src/lib/manager-dashboard.spec.ts`: live/demo/error와 KPI 표시 테스트.
- `apps/web/src/lib/ticket-manager-api-state.spec.ts`: 티켓 live-empty/network-demo/HTTP-error 경계 테스트.
- `apps/web/src/app/manager/_components/ManagerSidebar.tsx`: 경로 기반 전역 사이드바.
- `apps/web/src/app/manager/_components/ManagerSectionNav.tsx`: 현재 도메인의 ID-free 하위 메뉴를 상단 subnav로 렌더.
- `apps/web/src/app/manager/_components/ManagerAssistant.tsx`: 고정 AI 패널과 `<dialog>` 실행기.
- `apps/web/src/app/manager/_components/ManagerAppShell.tsx`: 공유 셸·사이드바·AI 조합.
- `apps/web/src/app/manager/_components/ManagerDashboard.tsx`: 통합 KPI·업무·운영 현황 UI.
- `apps/web/src/app/manager/home/00/loading.tsx`: 대시보드 구조와 같은 비애니메이션 로딩 스켈레톤.
- `apps/web/src/app/manager/home/_components.tsx`: home 화면용 공통 래퍼와 데모 표기.
- `apps/web/src/app/manager/manager-workspace-shell.spec.ts`: 셸 슬롯·접근성·마이그레이션 소스 계약.

### Modified files

- `packages/ui/src/components/ManagerShell.tsx`: `subnav`, `headerActions`, `rightRail` 레이아웃 슬롯.
- `packages/ui/src/tokens.css`: 관리자 셸 크기·상태·포커스 의미 토큰.
- `apps/web/src/app/manager/globals.css`: 셸 반응형 CSS와 레거시 `--border`·`--shadow` 충돌 제거.
- `apps/web/src/app/manager/page.tsx`: `/manager/home/00`으로 redirect.
- `apps/web/src/lib/ticket-manager-api.ts`: `live | demo | error` 티켓 목록 결과.
- `apps/web/src/app/manager/home/00/page.tsx`: 원천별 상태를 조합하는 통합 대시보드 서버 화면.
- `apps/web/src/app/manager/home/00/ManagerHomeTabs.tsx`: 제거 후 계약 상세·채팅 코드를 `ManagerDashboard.tsx`로 이동.
- `apps/web/src/app/manager/agent/realtime/page.tsx`: `prompt` query 읽기.
- `apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx`: 초기 프롬프트를 한 번만 입력.
- 관리자 도메인 layout/wrapper: `agent`, `billing`, `contract`, `cost`, `messaging`, `moveout`, `report`, `ticket/dash`, `vendor-mgmt`, `home`.

---

### Task 1: Centralize manager navigation and route matching

**Files:**
- Create: `apps/web/src/lib/billing-manager-nav.ts`
- Create: `apps/web/src/lib/manager-navigation.ts`
- Create: `apps/web/src/lib/manager-navigation.spec.ts`
- Modify: `apps/web/src/app/manager/billing/_components.tsx`

**Interfaces:**
- Produces: `MANAGER_BILLING_ROUTES`, `managerBillHref(id)`, `managerDunningHref(id)`.
- Produces: `MANAGER_NAV_GROUPS: readonly ManagerNavGroup[]`.
- Produces: `getManagerNavState(pathname: string): ManagerNavState`.
- Produces: `ManagerNavItemId`, `ManagerNavItem`, `ManagerNavChild`, `ManagerNavState`.

- [ ] **Step 1: Write the failing navigation test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANAGER_NAV_GROUPS,
  getManagerNavState,
  type ManagerNavItem,
} from "./manager-navigation";

const items: ManagerNavItem[] = MANAGER_NAV_GROUPS.flatMap((group) => [...group.items]);
const hrefs = items.flatMap((item) => [item.href, ...item.children.map((child) => child.href)]);

describe("manager workspace navigation", () => {
  it("contains every manager desktop domain entry", () => {
    assert.deepEqual(items.map((item) => item.id), [
      "dashboard", "listing", "contract", "billing", "cost", "ticket",
      "messaging", "moveout", "vendor", "report", "assistant", "settings",
    ]);
  });

  it("keeps entity-bound routes out of permanent navigation", () => {
    for (const contextualHref of [
      "/manager/contract/01", "/manager/cost/02", "/manager/ticket/dash/01",
      "/manager/messaging/02", "/manager/moveout/01", "/manager/vendor-mgmt/01",
      "/manager/report/02",
    ]) assert.equal(hrefs.includes(contextualHref), false, contextualHref);
  });

  it("selects a parent for contextual routes without inventing a child", () => {
    assert.deepEqual(getManagerNavState("/manager/ticket/dash/04?id=tk_1"), {
      activeItemId: "ticket",
      activeChildHref: null,
    });
    assert.deepEqual(getManagerNavState("/manager/contract/00"), {
      activeItemId: "contract",
      activeChildHref: "/manager/contract/00",
    });
  });

  it("marks prototype home links and the external listing link", () => {
    const dashboard = items.find((item) => item.id === "dashboard");
    const listing = items.find((item) => item.id === "listing");
    assert.equal(dashboard?.children.find((child) => child.href === "/manager/home/03")?.demo, true);
    assert.equal(listing?.external, true);
  });

  it("matches every permanent child and keeps settings separate from dashboard", () => {
    for (const item of items) {
      for (const child of item.children) {
        assert.deepEqual(getManagerNavState(child.href), { activeItemId: item.id, activeChildHref: child.href });
      }
    }
    assert.deepEqual(getManagerNavState("/manager/home/06"), { activeItemId: "settings", activeChildHref: null });
    assert.deepEqual(getManagerNavState("/sell"), { activeItemId: "listing", activeChildHref: null });
    assert.deepEqual(getManagerNavState("/manager/agent/realtime"), { activeItemId: "assistant", activeChildHref: null });
  });

  it("matches every contextual route to its parent only", () => {
    const cases = [
      ["/manager/contract/01?id=doc", "contract"], ["/manager/billing/bill-1", "billing"],
      ["/manager/cost/03?id=cost", "cost"], ["/manager/messaging/04?id=thread", "messaging"],
      ["/manager/moveout/02?id=moveout", "moveout"], ["/manager/vendor-mgmt/02?id=vendor", "vendor"],
      ["/manager/report/03?id=report", "report"],
    ] as const;
    for (const [pathname, activeItemId] of cases) {
      assert.deepEqual(getManagerNavState(pathname), { activeItemId, activeChildHref: null });
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
docker compose run --rm --no-deps --build -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-navigation.spec.ts
```

Expected: FAIL with `Cannot find module './manager-navigation'`.

- [ ] **Step 3: Add the billing route source**

```ts
export const MANAGER_BILLING_ROUTES = {
  dashboard: "/manager/billing",
  collection: "/manager/billing/collection",
  matching: "/manager/billing/matching",
  overdue: "/manager/billing/overdue",
} as const;

export function managerBillHref(billId: string): string {
  const id = encodeURIComponent(billId);
  return `/manager/billing/${id}?id=${id}`;
}

export function managerDunningHref(billId: string): string {
  const id = encodeURIComponent(billId);
  return `/manager/billing/dunning/${id}?id=${id}`;
}
```

In `billing/_components.tsx`, replace the local route object with:

```ts
import {
  MANAGER_BILLING_ROUTES,
  managerBillHref,
  managerDunningHref,
} from "@/lib/billing-manager-nav";

export const routes = {
  ...MANAGER_BILLING_ROUTES,
  dunning: managerDunningHref,
  bill: managerBillHref,
};
```

- [ ] **Step 4: Implement the navigation model**

Define these exact IDs and groups in `manager-navigation.ts`:

```ts
export type ManagerNavItemId =
  | "dashboard" | "listing" | "contract" | "billing" | "cost" | "ticket"
  | "messaging" | "moveout" | "vendor" | "report" | "assistant" | "settings";

export interface ManagerNavChild { label: string; href: string; demo?: true }
export interface ManagerNavItem {
  id: ManagerNavItemId;
  label: string;
  href: string;
  icon: ManagerNavItemId;
  activePrefixes: readonly string[];
  children: readonly ManagerNavChild[];
  external?: true;
}
export interface ManagerNavGroup { label: string; items: readonly ManagerNavItem[] }
export interface ManagerNavState { activeItemId: ManagerNavItemId | null; activeChildHref: string | null }
```

Populate `MANAGER_NAV_GROUPS` with this exact permanent menu:

| Group | Item | Permanent children |
| --- | --- | --- |
| 워크스페이스 | 통합 대시보드 | home 00, 01, 02(demo), 03(demo), 05(demo) |
| 임대 운영 | 매물 관리 | none; `/sell`, `external: true` |
| 임대 운영 | 계약 관리 | contract 00, 02 |
| 임대 운영 | 청구·수납 | billing dashboard, collection, matching, overdue |
| 임대 운영 | 비용 원장 | cost 00, 01, 04 |
| 운영 지원 | 민원·하자 | ticket dash 00 |
| 운영 지원 | 소통·공지 | messaging 00, 01 |
| 운영 지원 | 퇴실·정산 | moveout 00 |
| 운영 지원 | 업체 관리 | vendor 00, 03 |
| 인사이트 | 운영 리포트 | report 00, 01, 05 |
| 인사이트 | AI 비서 | realtime agent |
| 계정 | 설정 | home 06 |

Import existing route constants from their `src/lib/*-nav.ts` files. Implement path matching exactly as follows:

Use these exact `activePrefixes`; never use the broad `/manager/home` prefix:

| Item | Active prefixes |
| --- | --- |
| dashboard | `/manager/home/00`, `/manager/home/01`, `/manager/home/02`, `/manager/home/03`, `/manager/home/04`, `/manager/home/05` |
| listing | `/sell` |
| contract | `/manager/contract` |
| billing | `/manager/billing` |
| cost | `/manager/cost` |
| ticket | `/manager/ticket/dash` |
| messaging | `/manager/messaging` |
| moveout | `/manager/moveout` |
| vendor | `/manager/vendor-mgmt` |
| report | `/manager/report` |
| assistant | `/manager/agent` |
| settings | `/manager/home/06` |

```ts
function cleanPathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function pathMatches(pathname: string, candidate: string): boolean {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

export function getManagerNavState(pathname: string): ManagerNavState {
  const path = cleanPathname(pathname);
  const items = MANAGER_NAV_GROUPS.flatMap((group) => group.items);
  const item = items.find((candidate) =>
    candidate.activePrefixes.some((prefix) => pathMatches(path, prefix)),
  );
  if (!item) return { activeItemId: null, activeChildHref: null };
  const child = item.children.find((candidate) => cleanPathname(candidate.href) === path);
  return { activeItemId: item.id, activeChildHref: child?.href ?? null };
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run Step 2 again. Expected: 6 tests PASS.

```bash
git add apps/web/src/lib/billing-manager-nav.ts apps/web/src/lib/manager-navigation.ts \
  apps/web/src/lib/manager-navigation.spec.ts apps/web/src/app/manager/billing/_components.tsx
git commit -m "feat(manager): centralize workspace navigation"
```

---

### Task 2: Expand ManagerShell and canonical workspace tokens

**Files:**
- Modify: `packages/ui/src/components/ManagerShell.tsx`
- Modify: `packages/ui/src/tokens.css`
- Modify: `apps/web/src/app/manager/globals.css`
- Create: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Produces: `ManagerShellProps.subnav`, `headerActions`, `rightRail`.
- Produces CSS hooks: `manager-workspace`, `manager-workspace__sidebar`, `manager-workspace__content`, `manager-workspace__header`, `manager-workspace__body`, `manager-workspace__main`, `manager-workspace__rail`.

- [ ] **Step 1: Write the failing shell contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const shellSource = readFileSync(join(root, "../../packages/ui/src/components/ManagerShell.tsx"), "utf8");
const tokenSource = readFileSync(join(root, "../../packages/ui/src/tokens.css"), "utf8");
const managerCss = readFileSync(join(root, "src/app/manager/globals.css"), "utf8");

test("manager shell exposes navigation, subnav, actions, and right rail slots", () => {
  for (const prop of ["subnav", "headerActions", "rightRail"]) {
    assert.match(shellSource, new RegExp(`${prop}\\??:`));
  }
  for (const className of ["manager-workspace__sidebar", "manager-workspace__main", "manager-workspace__rail"]) {
    assert.match(shellSource, new RegExp(className));
    assert.match(managerCss, new RegExp(`\\.${className}`));
  }
  assert.doesNotMatch(shellSource, /100vh/);
});

test("manager workspace uses canonical tokens without manager-local collisions", () => {
  assert.match(tokenSource, /--manager-sidebar-width:/);
  assert.match(tokenSource, /--manager-assistant-width:/);
  assert.match(tokenSource, /--focus-ring:/);
  assert.doesNotMatch(managerCss, /^\s*--border:/m);
  assert.doesNotMatch(managerCss, /^\s*--shadow:/m);
});
```

- [ ] **Step 2: Run the shell test and verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the new slots and CSS hooks do not exist.

- [ ] **Step 3: Add semantic and layout tokens**

Add to `tokens.css` only; consumers use variables rather than these raw values:

```css
  --success: #137a46;
  --on-success: #ffffff;
  --success-container: #e8f7ee;
  --on-success-container: #136c34;
  --warning: #8a5200;
  --warning-container: #fff1d6;
  --on-warning-container: #6d4100;
  --focus-ring: 0 0 0 3px rgba(47, 85, 255, 0.28);
  --manager-sidebar-width: 256px;
  --manager-assistant-width: 320px;
  --manager-assistant-compact-width: 280px;
  --manager-content-max: 1600px;
  --z-floating: 20;
  --z-overlay: 30;
```

- [ ] **Step 4: Replace ManagerShell with the slot-based semantic structure**

```tsx
import type { ReactNode } from "react";

export interface ManagerShellProps {
  title: ReactNode;
  context?: ReactNode;
  nav?: ReactNode;
  subnav?: ReactNode;
  headerActions?: ReactNode;
  rightRail?: ReactNode;
  children: ReactNode;
}

export function ManagerShell({
  title, context, nav, subnav, headerActions, rightRail, children,
}: ManagerShellProps) {
  return (
    <div className={rightRail ? "manager-workspace manager-workspace--with-rail" : "manager-workspace"}>
      {nav ? <aside className="manager-workspace__sidebar">{nav}</aside> : null}
      <section className="manager-workspace__content">
        <header className="manager-workspace__header">
          <div className="manager-workspace__heading">
            <div className="manager-workspace__title">{title}</div>
            {context ? <div className="manager-workspace__context">{context}</div> : null}
          </div>
          {headerActions ? <div className="manager-workspace__header-actions">{headerActions}</div> : null}
        </header>
        {subnav ? <div className="manager-workspace__subnav">{subnav}</div> : null}
        <div className="manager-workspace__body">
          <main className="manager-workspace__main">{children}</main>
          {rightRail ? <aside className="manager-workspace__rail">{rightRail}</aside> : null}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Remove legacy token collisions and add responsive workspace CSS**

Rename the manager-local root declarations and every pre-existing use of `--border` and `--shadow` in `manager/globals.css` to `--manager-legacy-border` and `--manager-legacy-shadow`. Wrap the new block in the shown comments, then append:

```css
/* manager-workspace:start */
.manager-workspace {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--manager-sidebar-width) minmax(0, 1fr);
  background: var(--surface);
  color: var(--on-surface);
  font-family: var(--font-sans);
}
.manager-workspace__sidebar { position: sticky; top: 0; height: 100dvh; overflow-y: auto; border-right: 1px solid var(--border); background: var(--surface-container-lowest); }
.manager-workspace__content, .manager-workspace__main { min-width: 0; }
.manager-workspace__header { min-height: var(--header-height); display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-md) var(--space-xl); border-bottom: 1px solid var(--border); background: var(--surface-container-lowest); }
.manager-workspace__title { font-size: var(--fs-title); font-weight: var(--fw-title); line-height: var(--lh-title); text-wrap: balance; }
.manager-workspace__context { color: var(--on-surface-variant); font-size: var(--fs-caption); line-height: var(--lh-caption); }
.manager-workspace__subnav { padding: var(--space-sm) var(--space-xl); overflow-x: auto; border-bottom: 1px solid var(--border); background: var(--surface-container-lowest); }
.manager-workspace__body { width: min(100%, var(--manager-content-max)); display: grid; grid-template-columns: minmax(0, 1fr); margin: 0 auto; }
.manager-workspace--with-rail .manager-workspace__body { grid-template-columns: minmax(0, 1fr) var(--manager-assistant-width); }
.manager-workspace__main { padding: var(--space-xl); }
.manager-workspace__rail { min-width: 0; padding: var(--space-xl) var(--space-xl) var(--space-xl) 0; }
@media (max-width: 1180px) { .manager-workspace--with-rail .manager-workspace__body { grid-template-columns: minmax(0, 1fr) var(--manager-assistant-compact-width); } .manager-workspace__main { padding: var(--space-lg); } .manager-workspace__rail { padding: var(--space-lg) var(--space-lg) var(--space-lg) 0; } }
@media (max-width: 860px) { .manager-workspace { grid-template-columns: minmax(0, 1fr); } .manager-workspace__sidebar { display: none; } .manager-workspace--with-rail .manager-workspace__body { grid-template-columns: minmax(0, 1fr); } .manager-workspace__main, .manager-workspace__header { padding-inline: var(--space-lg); } .manager-workspace__rail { padding: 0 var(--space-lg) var(--space-lg); } }
/* manager-workspace:end */
```

- [ ] **Step 6: Run GREEN checks and commit**

```bash
docker compose run --rm --no-deps -w /app web pnpm --filter @roomlog/ui typecheck
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: UI typecheck succeeds and 2 tests PASS.

```bash
git add packages/ui/src/components/ManagerShell.tsx packages/ui/src/tokens.css \
  apps/web/src/app/manager/globals.css apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat(manager): add responsive workspace shell"
```

---

### Task 3: Build the global sidebar and reusable AI assistant

**Files:**
- Create: `apps/web/src/lib/manager-assistant.ts`
- Create: `apps/web/src/lib/manager-assistant.spec.ts`
- Create: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- Create: `apps/web/src/app/manager/_components/ManagerSectionNav.tsx`
- Create: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Create: `apps/web/src/app/manager/_components/ManagerAppShell.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: `MANAGER_NAV_GROUPS`, `getManagerNavState()` from Task 1.
- Produces: `normalizeManagerPrompt(prompt: string): string`, `managerAgentHref(prompt: string): string`.
- Produces: `ManagerAssistantBriefingItem` and `ManagerAppShellProps`.

- [ ] **Step 1: Write failing prompt and interaction-surface contracts**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_MANAGER_PROMPT_LENGTH, managerAgentHref, normalizeManagerPrompt } from "./manager-assistant";

describe("manager assistant prompt", () => {
  it("trims and limits prompts", () => {
    assert.equal(normalizeManagerPrompt("  수납 현황 알려줘  "), "수납 현황 알려줘");
    assert.equal(normalizeManagerPrompt("가".repeat(1200)).length, MAX_MANAGER_PROMPT_LENGTH);
  });
  it("creates an encoded prefill URL without an execution flag", () => {
    assert.equal(managerAgentHref("  411호 연체 내역?  "), "/manager/agent/realtime?prompt=411%ED%98%B8+%EC%97%B0%EC%B2%B4+%EB%82%B4%EC%97%AD%3F");
    assert.equal(managerAgentHref("   "), "/manager/agent/realtime");
    assert.doesNotMatch(managerAgentHref("보내줘"), /submit|execute|send/);
  });
});
```

In `manager-workspace-shell.spec.ts`, add `existsSync` to the `node:fs` import and append before creating the components:

```ts
const sidebarPath = join(root, "src/app/manager/_components/ManagerSidebar.tsx");
const sectionNavPath = join(root, "src/app/manager/_components/ManagerSectionNav.tsx");
const assistantPath = join(root, "src/app/manager/_components/ManagerAssistant.tsx");
const appShellPath = join(root, "src/app/manager/_components/ManagerAppShell.tsx");

test("manager app shell exposes accessible sidebar and assistant dialogs", () => {
  for (const path of [sidebarPath, sectionNavPath, assistantPath, appShellPath]) assert.equal(existsSync(path), true, path);
  const sidebar = readFileSync(sidebarPath, "utf8");
  const sectionNav = readFileSync(sectionNavPath, "utf8");
  const assistant = readFileSync(assistantPath, "utf8");
  const appShell = readFileSync(appShellPath, "utf8");
  assert.match(sidebar, /onNavigate\?:/);
  assert.match(sidebar, /showCloseButton\?:/);
  assert.match(sectionNav, /aria-current/);
  assert.match(assistant, /showModal\(\)/);
  assert.match(assistant, /aria-label="AI 관리 비서 닫기"/);
  assert.match(appShell, /aria-haspopup="dialog"/);
  assert.match(appShell, /<ManagerSectionNav/);
  assert.match(appShell, /!fullAssistant/);
});
```

- [ ] **Step 2: Verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-assistant.spec.ts \
  src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the helper and four workspace components do not exist.

- [ ] **Step 3: Implement the helper**

```ts
export const MAX_MANAGER_PROMPT_LENGTH = 1000;
export interface ManagerAssistantBriefingItem { label: string; value: string; href: string; tone?: "default" | "attention" }
export function normalizeManagerPrompt(prompt: string): string { return prompt.trim().slice(0, MAX_MANAGER_PROMPT_LENGTH); }
export function managerAgentHref(prompt: string): string {
  const normalized = normalizeManagerPrompt(prompt);
  if (!normalized) return "/manager/agent/realtime";
  return `/manager/agent/realtime?${new URLSearchParams({ prompt: normalized }).toString()}`;
}
```

- [ ] **Step 4: Implement ManagerSidebar**

Make it a client component. Map each `ManagerNavItemId` to one Lucide icon, call `getManagerNavState(usePathname())`, render group labels and links, and render only the active item's children. Exact accessibility requirements:

```ts
export interface ManagerSidebarProps {
  onNavigate?: () => void;
  showCloseButton?: boolean;
}
```

```tsx
<nav aria-label="관리자 전체 메뉴">
  <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}>
    <Icon aria-hidden="true" /><span>{item.label}</span>
  </Link>
  {active ? item.children.map((child) => (
    <Link key={child.href} href={child.href} onClick={onNavigate} aria-current={state.activeChildHref === child.href ? "page" : undefined}>
      <span>{child.label}</span>{child.demo ? <span>데모</span> : null}
    </Link>
  )) : null}
</nav>
```

Include brand link `/manager/home/00` with `onClick={onNavigate}`, role text `관리자 워크스페이스`, and render the icon-only `aria-label="관리자 메뉴 닫기"` button only when `showCloseButton` is true. Its click handler is `onNavigate`.

- [ ] **Step 5: Implement ManagerSectionNav from the same route model**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MANAGER_NAV_GROUPS, getManagerNavState } from "@/lib/manager-navigation";

export function ManagerSectionNav() {
  const state = getManagerNavState(usePathname());
  const item = MANAGER_NAV_GROUPS.flatMap((group) => group.items).find((candidate) => candidate.id === state.activeItemId);
  if (!item?.children.length) return null;
  return <nav aria-label={`${item.label} 하위 메뉴`} className="manager-section-nav">{item.children.map((child) => <Link key={child.href} href={child.href} aria-current={state.activeChildHref === child.href ? "page" : undefined}>{child.label}{child.demo ? <span>데모</span> : null}</Link>)}</nav>;
}
```

- [ ] **Step 6: Implement ManagerAssistantPanel and ManagerAssistantLauncher**

`ManagerAssistantPanel` must contain: ROOMLOG AI greeting, optional briefing links, safe quick links to ticket dashboard/billing overdue/messaging compose, a labeled textarea, submit through `router.push(managerAgentHref(prompt))`, full realtime voice link, and the notice `AI 제안은 초안입니다. 발송·결제·확정은 원천 화면에서 직접 확인합니다.`

`ManagerAssistantLauncher` must use:

```tsx
const dialogRef = useRef<HTMLDialogElement>(null);
<button type="button" aria-label="AI 관리 비서 열기" onClick={() => dialogRef.current?.showModal()}>
  <Bot aria-hidden="true" /><span>AI 비서</span>
</button>
<dialog ref={dialogRef} aria-labelledby="manager-assistant-dialog-title">
  <strong id="manager-assistant-dialog-title">AI 관리 비서</strong>
  <button type="button" aria-label="AI 관리 비서 닫기" onClick={() => dialogRef.current?.close()}><X aria-hidden="true" /></button>
  <ManagerAssistantPanel managerName={managerName} contextLabel={contextLabel} />
</dialog>
```

- [ ] **Step 7: Implement ManagerAppShell**

```tsx
"use client";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ManagerShell } from "@roomlog/ui";
import type { ManagerAssistantBriefingItem } from "@/lib/manager-assistant";
import { ManagerAssistantLauncher, ManagerAssistantPanel } from "./ManagerAssistant";
import { ManagerSectionNav } from "./ManagerSectionNav";
import { ManagerSidebar } from "./ManagerSidebar";

export interface ManagerAppShellProps { title: ReactNode; context?: ReactNode; subnav?: ReactNode; managerName?: string; showAssistantRail?: boolean; assistantBriefing?: readonly ManagerAssistantBriefingItem[]; children: ReactNode }
export function ManagerAppShell({ title, context, subnav, managerName, showAssistantRail = false, assistantBriefing = [], children }: ManagerAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const fullAssistant = pathname.startsWith("/manager/agent/realtime");
  function openMobileNavigation() { mobileDialogRef.current?.showModal(); setMobileOpen(true); }
  function closeMobileNavigation() { mobileDialogRef.current?.close(); setMobileOpen(false); }
  const action = <button type="button" className="manager-mobile-menu" aria-label="관리자 메뉴 열기" aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={openMobileNavigation}><Menu aria-hidden="true" /></button>;
  const rail = showAssistantRail ? <ManagerAssistantPanel managerName={managerName} contextLabel="통합 대시보드" briefing={assistantBriefing} /> : undefined;
  return <><ManagerShell title={title} context={context} nav={<ManagerSidebar />} subnav={subnav ?? <ManagerSectionNav />} headerActions={action} rightRail={rail}>{children}</ManagerShell><dialog ref={mobileDialogRef} className="manager-mobile-nav-dialog" aria-label="관리자 전체 메뉴" onClose={() => setMobileOpen(false)}><ManagerSidebar onNavigate={closeMobileNavigation} showCloseButton /></dialog>{!showAssistantRail && !fullAssistant ? <ManagerAssistantLauncher managerName={managerName} contextLabel={typeof title === "string" ? title : "현재 관리자 화면"} /> : null}</>;
}
```

- [ ] **Step 8: Add token-only component CSS**

Add classes for the sidebar, section nav, assistant panel, fixed launcher, dialog, mobile button, active states, and `:focus-visible`. Fixed positions must use `env(safe-area-inset-right)` and `env(safe-area-inset-bottom)`.

The core layout rules are:

```css
.manager-sidebar { min-height: 100%; display: flex; flex-direction: column; padding: var(--space-lg); }
.manager-sidebar__brand a, .manager-sidebar__link, .manager-sidebar__child { display: flex; align-items: center; gap: var(--space-sm); border-radius: var(--radius); color: var(--on-surface); text-decoration: none; }
.manager-sidebar__link { min-height: var(--touch-target); padding: 0 var(--space-md); }
.manager-sidebar__link.is-active, .manager-sidebar__child.is-active { background: var(--primary-container); color: var(--on-primary-container); }
.manager-sidebar__children { display: grid; gap: var(--space-xs); padding: var(--space-xs) 0 var(--space-sm) var(--space-xxl); }
.manager-sidebar__child { min-height: 40px; justify-content: space-between; padding: 0 var(--space-sm); font-size: var(--fs-caption); }
.manager-section-nav { display: flex; align-items: center; gap: var(--space-sm); min-width: max-content; }
.manager-section-nav a { display: inline-flex; align-items: center; gap: var(--space-xs); min-height: 40px; padding: 0 var(--space-md); border-radius: var(--radius); color: var(--on-surface-variant); text-decoration: none; }
.manager-section-nav a[aria-current="page"] { background: var(--primary-container); color: var(--on-primary-container); }
.manager-assistant { display: grid; gap: var(--space-lg); padding: var(--space-lg); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-container-lowest); }
.manager-workspace__rail > .manager-assistant { position: sticky; top: var(--space-xl); }
.manager-assistant__briefing, .manager-assistant__quick, .manager-assistant__form { display: grid; gap: var(--space-sm); }
.manager-assistant__form textarea { min-height: 112px; resize: vertical; border: 1px solid var(--input-border); border-radius: var(--radius); padding: var(--space-md); color: var(--input-text); background: var(--surface-container-lowest); }
.manager-assistant-launcher { position: fixed; right: calc(var(--space-xl) + env(safe-area-inset-right)); bottom: calc(var(--space-xl) + env(safe-area-inset-bottom)); z-index: var(--z-floating); min-height: var(--touch-target); padding: 0 var(--space-lg); border-radius: var(--radius-full); background: var(--primary); color: var(--on-primary); }
.manager-mobile-menu { display: none; min-width: var(--touch-target); min-height: var(--touch-target); place-items: center; border-radius: var(--radius); color: var(--on-surface); background: var(--surface-container); }
.manager-assistant-dialog { width: min(420px, calc(100% - var(--space-xxl))); max-height: calc(100dvh - var(--space-xxl)); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0; color: var(--on-surface); background: var(--surface-container-lowest); }
.manager-mobile-nav-dialog { width: min(var(--manager-sidebar-width), calc(100% - var(--space-xxl))); height: 100dvh; max-height: none; margin: 0 auto 0 0; border: 0; padding: 0; color: var(--on-surface); background: var(--surface-container-lowest); }
.manager-sidebar a:focus-visible, .manager-sidebar button:focus-visible, .manager-assistant a:focus-visible, .manager-assistant button:focus-visible, .manager-assistant textarea:focus-visible { outline: none; box-shadow: var(--focus-ring); }
@media (max-width: 860px) { .manager-workspace__rail > .manager-assistant { position: static; } .manager-mobile-menu { display: grid; } }
```

- [ ] **Step 9: Verify automated GREEN**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-assistant.spec.ts \
  src/app/manager/manager-workspace-shell.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 10: Verify dialog interactions before commit**

Rebuild web, open an authenticated non-dashboard manager route with the in-app browser, and perform this exact sequence:

1. Focus and activate `AI 관리 비서 열기`; confirm the named dialog is open and focus is inside it.
2. Press Escape; confirm the dialog closes and focus returns to the launcher.
3. At a viewport below 860px activate `관리자 메뉴 열기`; confirm `aria-expanded=true` and the mobile navigation dialog is open.
4. Select a sidebar link; confirm the route changes, the dialog closes, and `aria-expanded=false`.
5. Open `/manager/agent/realtime`; confirm no `AI 관리 비서 열기` button exists.

- [ ] **Step 11: Commit the global shell composition**

```bash
git add apps/web/src/lib/manager-assistant.ts apps/web/src/lib/manager-assistant.spec.ts \
  apps/web/src/app/manager/_components apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat(manager): add global sidebar and AI assistant"
```

---

### Task 4: Route manager root and prefill the realtime agent

**Files:**
- Modify: `apps/web/src/app/manager/page.tsx`
- Modify: `apps/web/src/app/manager/agent/realtime/page.tsx`
- Modify: `apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx`
- Modify: `apps/web/src/app/manager/agent/realtime-entry.spec.ts`

**Interfaces:**
- Consumes: `normalizeManagerPrompt()` from Task 3.
- Produces: `ManagerRealtimeConsole({ initialPrompt?: string })`.

- [ ] **Step 1: Add failing route and prefill assertions**

Add to `realtime-entry.spec.ts`:

```ts
const managerIndexSource = readFileSync(join(root, "src/app/manager/page.tsx"), "utf8");

test("manager root opens the unified dashboard", () => {
  assert.match(managerIndexSource, /redirect\("\/manager\/home\/00"\)/);
  assert.doesNotMatch(managerIndexSource, /redirect\("\/sell"\)/);
});

test("manager realtime prompt is prefilled once and never auto-submitted", () => {
  const pageSource = readFileSync(realtimePagePath, "utf8");
  const consoleSource = readFileSync(realtimeConsolePath, "utf8");
  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /normalizeManagerPrompt/);
  assert.match(pageSource, /initialPrompt=\{initialPrompt\}/);
  assert.match(consoleSource, /initialPrompt\?: string/);
  assert.match(consoleSource, /useState\(\(\) => normalizeManagerPrompt\(initialPrompt\)\)/);
  assert.doesNotMatch(consoleSource, /useEffect\([^)]*submitAgentMessage/);
});
```

- [ ] **Step 2: Verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/agent/realtime-entry.spec.ts
```

Expected: FAIL because root still redirects to `/sell` and the console has no `initialPrompt` prop.

- [ ] **Step 3: Change the root redirect**

```tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function ManagerIndex() {
  await requireUser("LANDLORD", "/manager/home/00");
  redirect("/manager/home/00");
}
```

- [ ] **Step 4: Pass and initialize a normalized prompt**

Apply this exact diff; it changes no other JSX in the page:

```diff
+import { normalizeManagerPrompt } from "@/lib/manager-assistant";
 import { ManagerRealtimeConsole } from "./ManagerRealtimeConsole";

+type SearchParams = Promise<{ prompt?: string }>;

-export default function Page() {
+export default async function Page({ searchParams }: { searchParams: SearchParams }) {
+  const { prompt = "" } = await searchParams;
+  const initialPrompt = normalizeManagerPrompt(prompt);
   return (
     <div style={{ display: "grid", gap: "var(--space-xl)" }}>
-      <ManagerRealtimeConsole />
+      <ManagerRealtimeConsole initialPrompt={initialPrompt} />
```
```

Change only the console signature and initial state; do not add a copying or submit effect:

```tsx
import { normalizeManagerPrompt } from "@/lib/manager-assistant";
export function ManagerRealtimeConsole({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [activeCommand, setActiveCommand] = useState<ManagerAgentCommandName>("ticket.query");
  const [chatText, setChatText] = useState(() => normalizeManagerPrompt(initialPrompt));
```

- [ ] **Step 5: Verify GREEN and commit**

Run Step 2 again. Expected: all realtime-entry tests PASS.

```bash
git add apps/web/src/app/manager/page.tsx apps/web/src/app/manager/agent/realtime/page.tsx \
  apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx \
  apps/web/src/app/manager/agent/realtime-entry.spec.ts
git commit -m "feat(manager): prefill realtime assistant prompts"
```

---

### Task 5: Migrate every manager desktop domain to ManagerAppShell

**Files:**
- Modify: `apps/web/src/app/manager/{agent,cost,messaging,moveout,report}/layout.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/layout.tsx`
- Modify: `apps/web/src/app/manager/{billing,contract}/_components.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/_components.tsx`
- Modify: `apps/web/src/app/manager/vendor-mgmt/{00,01,02,03,e0}/page.tsx`
- Create: `apps/web/src/app/manager/home/_components.tsx`
- Modify: `apps/web/src/app/manager/home/{01,02,03,04,05,06,e0}/page.tsx`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: `ManagerAppShell` from Task 3.
- Produces: `ManagerHomeShell`, `ManagerVendorMgmtShell`.
- Preserves: `BillingShell` and `ContractShell` public props used by existing pages.

- [ ] **Step 1: Add a failing migration inventory test**

Append to `manager-workspace-shell.spec.ts`:

```ts
const migratedShellFiles = [
  "src/app/manager/agent/layout.tsx",
  "src/app/manager/cost/layout.tsx",
  "src/app/manager/messaging/layout.tsx",
  "src/app/manager/moveout/layout.tsx",
  "src/app/manager/report/_components.tsx",
  "src/app/manager/ticket/dash/layout.tsx",
  "src/app/manager/billing/_components.tsx",
  "src/app/manager/contract/_components.tsx",
  "src/app/manager/vendor-mgmt/_components.tsx",
  "src/app/manager/home/_components.tsx",
];

test("every manager desktop domain composes ManagerAppShell", () => {
  for (const file of migratedShellFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /ManagerAppShell/, file);
  }
});

test("mobile manager surfaces remain outside ManagerAppShell", () => {
  for (const file of ["src/app/manager/vox/layout.tsx", "src/app/manager/ticket/call/layout.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /ManagerAppShell/, file);
  }
});
```

- [ ] **Step 2: Verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because domain files still use `ManagerShell` and home wrapper does not exist.

- [ ] **Step 3: Replace layout-level wrappers**

Use the agent layout as the guarded-layout replacement pattern:

```tsx
import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function ManagerAgentLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return <ManagerAppShell title="실시간 AI 운영 에이전트" context="관리 중인 집 · Realtime">{children}</ManagerAppShell>;
}
```

Use these exact titles, contexts, and existing auth locations:

| File | Title | Context | Auth handling |
| --- | --- | --- | --- |
| `cost/layout.tsx` | `비용 원장` | `관리 중인 집 · 비용 원장` | Keep synchronous; do not add auth in this UI task |
| `messaging/layout.tsx` | `소통` | `관리 중인 집 · 소통` | Keep existing `requireUser("LANDLORD")` |
| `moveout/layout.tsx` | `퇴실·정산 검토` | `관리 중인 집 · 퇴실 정산` | Keep synchronous; do not add auth in this UI task |
| `report/_components.tsx` | `운영 보고` | `관리 중인 집 · 임대인 보고` | Keep auth in `report/layout.tsx` |
| `ticket/dash/layout.tsx` | `하자/민원 티켓 처리` | `관리 중인 집 · 하자·민원` | Keep existing `requireUser("LANDLORD")` |

Remove duplicated static left-nav functions only after `ManagerSectionNav` renders the same ID-free routes from `MANAGER_NAV_GROUPS`. Do not alter contextual-ID links inside page content.

- [ ] **Step 4: Migrate BillingShell and ContractShell without changing callers**

```tsx
export function BillingShell({ title, active, children }: { title: ReactNode; active: string; children: ReactNode }) {
  void active;
  return <ManagerAppShell title={title} context="청구·수금·연체">{children}</ManagerAppShell>;
}

export function ContractShell({ id, title, children }: { id: ManagerContractScreenId; title: ReactNode; children: ReactNode }) {
  void id;
  return <ManagerAppShell title={title} context="관리 중인 집 · 계약서">{children}</ManagerAppShell>;
}
```

Delete `BillingNav` and `ContractNav` only after all callers compile and their ID-free routes appear through `ManagerSectionNav`.

- [ ] **Step 5: Add vendor and home wrappers**

In vendor `_components.tsx`:

```tsx
export function ManagerVendorMgmtShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <ManagerAppShell title={title} context="관리 중인 집 · 업체">{children}</ManagerAppShell>;
}
```

In `home/_components.tsx`:

```tsx
import type { ReactNode } from "react";
import { Badge } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";

export function ManagerHomeShell({ title, context, demo = false, children }: { title: ReactNode; context?: ReactNode; demo?: boolean; children: ReactNode }) {
  const renderedTitle = demo ? <span className="manager-demo-title"><span>{title}</span><Badge>데모</Badge></span> : title;
  return <ManagerAppShell title={renderedTitle} context={context}>{children}</ManagerAppShell>;
}
```

Replace vendor-page direct wrappers with `ManagerVendorMgmtShell`. Replace home 01–06 and e0 direct wrappers with `ManagerHomeShell`; pass `demo` on 02, 03, 04, and 05 only. Remove duplicated `HomeNav` and vendor nav uses.

Extend the migration source contract with:

```ts
const appShellSource = readFileSync(join(root, "src/app/manager/_components/ManagerAppShell.tsx"), "utf8");
const sectionNavSource = readFileSync(join(root, "src/app/manager/_components/ManagerSectionNav.tsx"), "utf8");
assert.match(appShellSource, /subnav \?\? <ManagerSectionNav/);
assert.match(sectionNavSource, /item\.children\.map/);
assert.match(sectionNavSource, /aria-current/);
```

- [ ] **Step 6: Preserve contextual entity IDs**

Keep existing helpers on record-bound links: `reportHref`, `withManagerMoveoutId`, `vendorHref`, bill dynamic hrefs, and `?id=${encodeURIComponent(id)}`. Add an assertion to the migration test that none of `/manager/contract/01`, `/manager/ticket/dash/01`, `/manager/vendor-mgmt/01`, `/manager/report/02` appear in `MANAGER_NAV_GROUPS`.

```ts
const navigationSource = readFileSync(join(root, "src/lib/manager-navigation.ts"), "utf8");
for (const contextualPath of ["/manager/contract/01", "/manager/ticket/dash/01", "/manager/vendor-mgmt/01", "/manager/report/02"]) {
  assert.doesNotMatch(navigationSource, new RegExp(`href:\\s*["']${contextualPath.replaceAll("/", "\\/")}`));
}
```

- [ ] **Step 7: Verify GREEN and commit**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
docker compose run --rm --no-deps -w /app web pnpm --filter web exec tsc --noEmit
```

Expected: migration tests PASS and TypeScript exits 0.

```bash
git add apps/web/src/app/manager/agent apps/web/src/app/manager/billing \
  apps/web/src/app/manager/contract apps/web/src/app/manager/cost \
  apps/web/src/app/manager/messaging apps/web/src/app/manager/moveout \
  apps/web/src/app/manager/report apps/web/src/app/manager/ticket/dash \
  apps/web/src/app/manager/vendor-mgmt apps/web/src/app/manager/home \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "refactor(manager): apply workspace shell across desktop routes"
```

---

### Task 6: Model independent dashboard source states

**Files:**
- Create: `apps/web/src/lib/manager-dashboard.ts`
- Create: `apps/web/src/lib/manager-dashboard.spec.ts`
- Create: `apps/web/src/lib/ticket-manager-api-state.spec.ts`
- Modify: `apps/web/src/lib/ticket-manager-api.ts`
- Modify: `apps/web/src/lib/ticket-manager-demo.spec.ts`

**Interfaces:**
- Produces: `ManagerSourceResult<T>`, `ManagerDashboardData`, `ManagerDashboardKpi`.
- Produces: `buildManagerDashboardKpis(data)`, `buildManagerAssistantBriefing(data)`.
- Produces: `listManagerTicketsState(filter?): Promise<ManagerTicketListResult>`.

- [ ] **Step 1: Write failing dashboard-state tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildManagerAssistantBriefing, buildManagerDashboardKpis, describeManagerSource, type ManagerDashboardData } from "./manager-dashboard";

const base: ManagerDashboardData = {
  managedRoomCount: 2,
  listings: { status: "live", data: [] },
  contracts: { status: "live", data: [] },
  tickets: { status: "live", data: [] },
  billing: { status: "live", data: { total: 4, pending: 1, overdue: 0 } },
};

describe("manager dashboard source states", () => {
  it("shows real zero only for successful empty sources", () => {
    const kpis = buildManagerDashboardKpis(base);
    assert.equal(kpis.find((kpi) => kpi.id === "tickets")?.value, "0");
    assert.equal(kpis.find((kpi) => kpi.id === "billing")?.value, "1 대기 · 0 연체");
  });
  it("does not turn source failures into zero", () => {
    const failed: ManagerDashboardData = { ...base, tickets: { status: "error", data: [], message: "권한 확인" }, billing: { status: "error", data: null, message: "조회 실패" } };
    const kpis = buildManagerDashboardKpis(failed);
    assert.equal(kpis.find((kpi) => kpi.id === "tickets")?.value, "확인 필요");
    assert.equal(kpis.find((kpi) => kpi.id === "billing")?.value, "확인 필요");
  });
  it("labels demo ticket fallback", () => {
    const demo: ManagerDashboardData = { ...base, tickets: { status: "demo", data: [{ id: "tk_demo", title: "누수", unitId: "302", statusLabel: "접수", urgent: true }], message: "API 미연결 데모" } };
    assert.equal(buildManagerDashboardKpis(demo).find((kpi) => kpi.id === "tickets")?.provenance, "데모");
    assert.match(buildManagerAssistantBriefing(demo)[0]?.value ?? "", /데모/);
  });
  it("gives error and empty states exactly one next action", () => {
    assert.deepEqual(describeManagerSource({ status: "error", data: [], message: "조회 실패" }, "비어 있음", "/manager/billing", "청구 열기"), { kind: "error", message: "조회 실패", action: { href: "/manager/billing", label: "청구 열기" } });
    assert.deepEqual(describeManagerSource({ status: "live", data: [] }, "비어 있음", "/sell", "매물 등록"), { kind: "empty", message: "비어 있음", action: { href: "/sell", label: "매물 등록" } });
  });
});
```

Create `ticket-manager-api-state.spec.ts` with dependency-boundary tests:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "./server-api";
import { loadManagerTicketList } from "./ticket-manager-api";

describe("manager ticket list provenance", () => {
  it("keeps a successful empty response live", async () => {
    assert.deepEqual(await loadManagerTicketList(async () => []), { status: "live", tickets: [] });
  });
  it("uses labeled demo data only when the network is unavailable", async () => {
    const result = await loadManagerTicketList(async () => { throw new TypeError("fetch failed"); });
    assert.equal(result.status, "demo");
    assert.ok(result.tickets.length > 0);
  });
  it("keeps HTTP and invalid-payload failures as errors", async () => {
    assert.equal((await loadManagerTicketList(async () => { throw new ApiError(401, "unauthorized"); })).status, "error");
    assert.equal((await loadManagerTicketList(async () => { throw new ApiError(503, "unavailable"); })).status, "error");
    assert.equal((await loadManagerTicketList(async () => { throw new SyntaxError("invalid json"); })).status, "error");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-dashboard.spec.ts \
  src/lib/ticket-manager-api-state.spec.ts
```

Expected: FAIL because `manager-dashboard.ts` and `loadManagerTicketList` do not exist.

- [ ] **Step 3: Implement dashboard types and pure builders**

```ts
import type { ManagerAssistantBriefingItem } from "./manager-assistant";
export interface ManagerListingRow { id: string; title: string; location: string; priceLabel: string; photoCount: number; has3D: boolean }
export interface ManagerContractRow { id: string; listingTitle: string; location: string; tenantName: string; priceLabel: string; acceptedAtLabel: string; threadId: string }
export interface ManagerTicketRow { id: string; title: string; unitId: string; statusLabel: string; urgent: boolean }
export interface ManagerBillingSummary { total: number; pending: number; overdue: number }
export type ManagerSourceResult<T> = { status: "live"; data: T } | { status: "demo"; data: T; message: string } | { status: "error"; data: T; message: string };
export interface ManagerDashboardData { managedRoomCount: number; listings: ManagerSourceResult<ManagerListingRow[]>; contracts: ManagerSourceResult<ManagerContractRow[]>; tickets: ManagerSourceResult<ManagerTicketRow[]>; billing: ManagerSourceResult<ManagerBillingSummary | null> }
export interface ManagerDashboardKpi { id: "rooms" | "listings" | "contracts" | "tickets" | "billing"; label: string; value: string; href: string; provenance?: "데모" }
export interface ManagerSourcePresentation { kind: "error" | "empty"; message: string; action: { href: string; label: string } }

function countValue<T>(source: ManagerSourceResult<T[]>): string { return source.status === "error" ? "확인 필요" : source.data.length.toLocaleString("ko-KR"); }
export function describeManagerSource<T>(source: ManagerSourceResult<T[]>, emptyMessage: string, href: string, label: string): ManagerSourcePresentation | null {
  if (source.status === "error") return { kind: "error", message: source.message, action: { href, label } };
  if (source.data.length === 0) return { kind: "empty", message: emptyMessage, action: { href, label } };
  return null;
}
export function buildManagerDashboardKpis(data: ManagerDashboardData): ManagerDashboardKpi[] {
  return [
    { id: "rooms", label: "관리 중인 집", value: data.managedRoomCount.toLocaleString("ko-KR"), href: "/manager/home/03" },
    { id: "listings", label: "미계약 매물", value: countValue(data.listings), href: "/sell" },
    { id: "contracts", label: "계약 중인 집", value: countValue(data.contracts), href: "/manager/contract/00" },
    { id: "tickets", label: "처리할 민원·하자", value: countValue(data.tickets), href: "/manager/ticket/dash/00", provenance: data.tickets.status === "demo" ? "데모" : undefined },
    { id: "billing", label: "수납 대기·연체", value: data.billing.status === "error" || !data.billing.data ? "확인 필요" : `${data.billing.data.pending.toLocaleString("ko-KR")} 대기 · ${data.billing.data.overdue.toLocaleString("ko-KR")} 연체`, href: "/manager/billing", provenance: data.billing.status === "demo" ? "데모" : undefined },
  ];
}
export function buildManagerAssistantBriefing(data: ManagerDashboardData): ManagerAssistantBriefingItem[] {
  const urgent = data.tickets.status === "error" ? "확인 필요" : `${data.tickets.data.filter((ticket) => ticket.urgent).length}건${data.tickets.status === "demo" ? " · 데모" : ""}`;
  const overdue = data.billing.status === "error" || !data.billing.data ? "확인 필요" : `${data.billing.data.overdue}건`;
  return [{ label: "긴급 민원", value: urgent, href: "/manager/ticket/dash/00", tone: "attention" }, { label: "연체", value: overdue, href: "/manager/billing/overdue", tone: data.billing.data?.overdue ? "attention" : "default" }, { label: "계약 중", value: countValue(data.contracts), href: "/manager/contract/00" }];
}
```

- [ ] **Step 4: Add explicit ticket list provenance**

In `ticket-manager-api.ts`, import `ApiError` and `MANAGER_DEMO_TICKETS`, then add:

```ts
export type ManagerTicketListResult = { status: "live"; tickets: Ticket[] } | { status: "demo"; tickets: Ticket[]; message: string } | { status: "error"; tickets: []; message: string };
type TeamTicketLoader = () => Promise<TeamManagerTicket[]>;
export function classifyManagerTicketListFailure(error: unknown): "demo" | "error" {
  if (!(error instanceof TypeError)) return "error";
  const causeCode = (error as TypeError & { cause?: { code?: string } }).cause?.code ?? "";
  return /fetch failed|network/i.test(error.message) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/.test(causeCode) ? "demo" : "error";
}
export async function loadManagerTicketList(loadTickets: TeamTicketLoader): Promise<ManagerTicketListResult> {
  try { return { status: "live", tickets: (await loadTickets()).map(toManagerTicket) }; }
  catch (error) {
    if (classifyManagerTicketListFailure(error) === "demo") {
      console.error("[manager/api] 티켓 API 미연결 → 출처 표시 데모 폴백:", error);
      return { status: "demo", tickets: [...MANAGER_DEMO_TICKETS], message: "API 미연결 데모 데이터" };
    }
    const message = error instanceof ApiError && (error.status === 401 || error.status === 403) ? "티켓 조회 권한을 확인해주세요." : "티켓 정보를 불러오지 못했습니다.";
    return { status: "error", tickets: [], message };
  }
}
export async function listManagerTicketsState(filter?: string): Promise<ManagerTicketListResult> { return loadManagerTicketList(() => listTeamTickets(filter)); }
export async function listManagerTickets(filter?: string): Promise<Ticket[]> { return (await listManagerTicketsState(filter)).tickets; }
```

Add to `ticket-manager-demo.spec.ts` an assertion that mutating a returned copy does not mutate `MANAGER_DEMO_TICKETS`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-dashboard.spec.ts \
  src/lib/ticket-manager-demo.spec.ts src/lib/ticket-manager-api-state.spec.ts
```

Expected: all focused tests PASS.

```bash
git add apps/web/src/lib/manager-dashboard.ts apps/web/src/lib/manager-dashboard.spec.ts \
  apps/web/src/lib/ticket-manager-api.ts apps/web/src/lib/ticket-manager-demo.spec.ts \
  apps/web/src/lib/ticket-manager-api-state.spec.ts
git commit -m "feat(manager): distinguish dashboard data provenance"
```

---

### Task 7: Replace home tabs with the integrated dashboard and AI rail

**Files:**
- Create: `apps/web/src/app/manager/_components/ManagerDashboard.tsx`
- Create: `apps/web/src/app/manager/home/00/loading.tsx`
- Modify: `apps/web/src/app/manager/home/00/page.tsx`
- Delete: `apps/web/src/app/manager/home/00/ManagerHomeTabs.tsx`
- Modify: `apps/web/src/app/manager/home/00/manager-home-agent-entry.spec.ts`
- Modify: `apps/web/src/app/manager/agent/realtime-entry.spec.ts`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `ManagerDashboardData`, KPI/briefing builders from Task 6.
- Consumes: `ManagerAppShell` from Task 3.
- Preserves: contract selection, contract summary, locked `TradeChatCenter` tenant thread.

- [ ] **Step 1: Replace tab assertions with failing integrated-dashboard assertions**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const pageSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const dashboardSource = readFileSync(join(root, "src/app/manager/_components/ManagerDashboard.tsx"), "utf8");

test("manager home is integrated and has a fixed AI rail", () => {
  assert.match(pageSource, /showAssistantRail/);
  assert.match(pageSource, /assistantBriefing=\{assistantBriefing\}/);
  assert.match(pageSource, /ManagerDashboard/);
  assert.doesNotMatch(dashboardSource, /role="tablist"/);
  for (const label of ["오늘의 업무", "최근 매물", "계약 중인 집", "민원·하자"]) assert.match(dashboardSource, new RegExp(label));
});
test("manager dashboard preserves locked tenant chat", () => {
  assert.match(dashboardSource, /openContractId/);
  assert.match(dashboardSource, /lockedThreadId=\{contract\.threadId\}/);
  assert.match(dashboardSource, /세입자 채팅/);
});

const loadingSource = readFileSync(join(root, "src/app/manager/home/00/loading.tsx"), "utf8");
test("manager dashboard loading state mirrors the final structure without motion", () => {
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /manager-dashboard__kpis/);
  assert.match(loadingSource, /manager-dashboard__operations/);
  assert.doesNotMatch(loadingSource, /animation|animate|motion/);
});
```

- [ ] **Step 2: Verify RED**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/app/manager/home/00/manager-home-agent-entry.spec.ts
```

Expected: FAIL because `ManagerDashboard.tsx` and `home/00/loading.tsx` do not exist.

- [ ] **Step 3: Assemble source results in the server page**

Retain current listing, accepted-contract, price, and billing mapping functions. Track a boolean error per try/catch and build:

```ts
const ticketResult = await listManagerTicketsState();
const dashboardData: ManagerDashboardData = {
  managedRoomCount: user?.managedRooms?.length ?? 0,
  listings: listingsError ? { status: "error", data: [], message: "매물 정보를 불러오지 못했습니다." } : { status: "live", data: listings },
  contracts: contractsError ? { status: "error", data: [], message: "계약 정보를 불러오지 못했습니다." } : { status: "live", data: contracts },
  tickets: ticketResult.status === "error" ? { status: "error", data: [], message: ticketResult.message } : ticketResult.status === "demo" ? { status: "demo", data: ticketResult.tickets.filter(isOpenTicket).map(toManagerTicketRow), message: ticketResult.message } : { status: "live", data: ticketResult.tickets.filter(isOpenTicket).map(toManagerTicketRow) },
  billing: billingError ? { status: "error", data: null, message: "청구 정보를 불러오지 못했습니다." } : { status: "live", data: billing },
};
const assistantBriefing = buildManagerAssistantBriefing(dashboardData);
const todayLabel = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date());
```

Define the helpers as:

```ts
function isOpenTicket(ticket: Ticket): boolean {
  return ticket.status !== "resolved" && ticket.status !== "cancelled";
}

function toManagerTicketRow(ticket: Ticket): ManagerTicketRow {
  return {
    id: ticket.id,
    title: ticket.title,
    unitId: ticket.unitId,
    statusLabel: ticketStatusLabels[ticket.status] ?? ticket.status,
    urgent: ticket.urgency <= 1,
  };
}
```

Initialize `let listingsError = false`, `let contractsError = false`, and `let billingError = false` before the existing corresponding `try` blocks, and set the matching boolean to `true` in each `catch`. Render:

```tsx
<ManagerAppShell title={`${user?.name ?? "관리인"} 통합 대시보드`} context="관리 중인 집 · 통합 현황" managerName={user?.name ?? "관리인"} showAssistantRail assistantBriefing={assistantBriefing}>
  <ManagerDashboard data={dashboardData} todayLabel={todayLabel} />
</ManagerAppShell>
```

- [ ] **Step 4: Implement ManagerDashboard in exact section order**

The client component must render:

1. Heading `오늘도 관리가 필요한 곳부터 볼게요` and current date.
2. KPI link grid from `buildManagerDashboardKpis(data)` with `font-variant-numeric: tabular-nums` and provenance badges.
3. `오늘의 업무` card with urgent tickets, billing overdue, and source-error CTAs linked to true domains.
4. Two-column `최근 매물` and `계약 중인 집` lists.
5. Full-width `민원·하자` list.
6. Source-local empty/error panels; each has one CTA only.

Move `ContractDashboard`, `InfoItem`, and the tenant-chat markup from `ManagerHomeTabs.tsx` into this file without changing `TradeChatCenter roleFilter="owner" lockedThreadId={contract.threadId}`. Contract rows set `openContractId`; the detail panel retains the back button.

Use this public component boundary and root structure:

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card } from "@roomlog/ui";
import { TradeChatCenter } from "@/app/_components/TradeChatCenter";
import { buildManagerDashboardKpis, describeManagerSource, type ManagerContractRow, type ManagerDashboardData } from "@/lib/manager-dashboard";

export function ManagerDashboard({ data, todayLabel }: { data: ManagerDashboardData; todayLabel: string }) {
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const openContract = data.contracts.data.find((contract) => contract.id === openContractId) ?? null;
  if (openContract) return <ContractDashboard contract={openContract} tickets={data.tickets.data} billing={data.billing.data} ticketHubHref="/manager/ticket/dash/00" billingHref="/manager/billing" onBack={() => setOpenContractId(null)} />;
  const kpis = buildManagerDashboardKpis(data);
  const urgentTickets = data.tickets.data.filter((ticket) => ticket.urgent);

  return (
    <div className="manager-dashboard">
      <header className="manager-dashboard__intro"><div><p>통합 운영 현황</p><h1>오늘도 관리가 필요한 곳부터 볼게요</h1></div><time>{todayLabel}</time></header>
      <section className="manager-dashboard__kpis" aria-label="주요 운영 지표">{kpis.map((kpi) => <Link key={kpi.id} href={kpi.href}><Card><span>{kpi.label}</span><strong>{kpi.value}</strong>{kpi.provenance ? <Badge>{kpi.provenance}</Badge> : null}</Card></Link>)}</section>
      <section aria-labelledby="manager-todo-title"><h2 id="manager-todo-title">오늘의 업무</h2><Card>{urgentTickets.map((ticket) => <Link key={ticket.id} href={`/manager/ticket/dash/01?id=${encodeURIComponent(ticket.id)}`}>{ticket.unitId} · {ticket.title}</Link>)}</Card></section>
      <div className="manager-dashboard__operations"><ListingSection source={data.listings} /><ContractList source={data.contracts} onOpen={setOpenContractId} /></div>
      <TicketSection source={data.tickets} />
    </div>
  );
}
```

Implement specialized row components so incompatible row types never share an untyped renderer. Each component calls `describeManagerSource(...)` first and renders its single returned action through `SourceFallback`; the following code shows the exact non-empty row destinations:

```tsx
function SourceFallback({ message, href, action }: { message: string; href: string; action: string }) {
  return <div className="manager-dashboard__empty"><p>{message}</p><Link href={href}>{action}</Link></div>;
}

function ListingSection({ source }: { source: ManagerDashboardData["listings"] }) {
  const fallback = describeManagerSource(source, "미계약 매물이 없습니다.", "/sell", "매물 등록하기");
  return <section aria-labelledby="manager-listings-title"><h2 id="manager-listings-title">최근 매물</h2><Card>{fallback ? <SourceFallback message={fallback.message} href={fallback.action.href} action={fallback.action.label} /> : source.data.slice(0, 4).map((listing) => <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`}>{listing.title}<span>{listing.location} · {listing.priceLabel}</span></Link>)}</Card></section>;
}

function ContractList({ source, onOpen }: { source: ManagerDashboardData["contracts"]; onOpen: (id: string) => void }) {
  const fallback = describeManagerSource(source, "계약 중인 집이 없습니다.", "/manager/contract/00", "계약 관리 열기");
  return <section aria-labelledby="manager-contracts-title"><h2 id="manager-contracts-title">계약 중인 집</h2><Card>{fallback ? <SourceFallback message={fallback.message} href={fallback.action.href} action={fallback.action.label} /> : source.data.slice(0, 4).map((contract) => <button key={contract.id} type="button" onClick={() => onOpen(contract.id)}>{contract.listingTitle}<span>{contract.tenantName} · {contract.priceLabel}</span></button>)}</Card></section>;
}

function TicketSection({ source }: { source: ManagerDashboardData["tickets"] }) {
  const fallback = describeManagerSource(source, "접수된 민원·하자가 없습니다.", "/manager/ticket/dash/00", "티켓 처리 열기");
  return <section aria-labelledby="manager-tickets-title"><h2 id="manager-tickets-title">민원·하자</h2><Card>{fallback ? <SourceFallback message={fallback.message} href={fallback.action.href} action={fallback.action.label} /> : source.data.slice(0, 6).map((ticket) => <Link key={ticket.id} href={`/manager/ticket/dash/01?id=${encodeURIComponent(ticket.id)}`}>{ticket.unitId} · {ticket.title}<span>{ticket.statusLabel}</span></Link>)}</Card></section>;
}
```

If `source.status === "demo"`, render a `데모` badge next to that section title. Paste the existing `ContractDashboard` implementation below these helpers and change only its imported row types.

- [ ] **Step 5: Add the structural loading surface**

```tsx
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";

export default function Loading() {
  return (
    <ManagerAppShell title="통합 대시보드" context="데이터 불러오는 중" showAssistantRail>
      <div className="manager-dashboard manager-dashboard--loading" aria-label="통합 대시보드 불러오는 중" aria-busy="true">
        <div className="manager-dashboard__intro manager-skeleton-block" />
        <div className="manager-dashboard__kpis">{Array.from({ length: 5 }, (_, index) => <div className="manager-skeleton-card" key={index} />)}</div>
        <div className="manager-skeleton-block" />
        <div className="manager-dashboard__operations"><div className="manager-skeleton-card" /><div className="manager-skeleton-card" /></div>
      </div>
    </ManagerAppShell>
  );
}
```

Style skeleton blocks with `var(--surface-container)` and `var(--surface-container-high)` only. Do not add shimmer, pulse, or any animation.

- [ ] **Step 6: Remove tabs and update old source-contract reads**

Delete `ManagerHomeTabs.tsx`. Point `realtime-entry.spec.ts` and `property-shell.spec.mjs` at `ManagerDashboard.tsx`. Preserve realtime, contract-detail, and locked-chat assertions; remove only four-tab assertions.

- [ ] **Step 7: Verify automated GREEN**

```bash
docker compose run --rm --no-deps -w /app/apps/web web \
  node --test -r ts-node/register src/lib/manager-dashboard.spec.ts \
  src/app/manager/home/00/manager-home-agent-entry.spec.ts \
  src/app/manager/agent/realtime-entry.spec.ts
docker compose build web
```

Expected: focused tests PASS and web image builds.

- [ ] **Step 8: Verify dashboard failure and interaction states before commit**

With the Docker stack and an authenticated landlord session:

1. Open `/manager/home/00`; confirm five KPI cards, today queue, three source sections, and the fixed AI rail.
2. Select a contract row; confirm the contract summary appears and opening `세입자 채팅` renders only the selected contract thread.
3. Close the chat and return to the overview; confirm focus returns to the initiating control.
4. Confirm every visible error or empty panel contains exactly one link/button CTA.
5. Re-run `ticket-manager-api-state.spec.ts` immediately before the browser check and confirm network-unavailable yields `demo` while HTTP/payload failures yield `error`; do not stop the full API because authentication also depends on it.

- [ ] **Step 9: Commit the integrated dashboard**

```bash
git add apps/web/src/app/manager/_components/ManagerDashboard.tsx \
  apps/web/src/app/manager/home/00 apps/web/src/app/manager/agent/realtime-entry.spec.ts \
  apps/web/property-shell.spec.mjs
git commit -m "feat(manager): build integrated AI dashboard"
```

---

### Task 8: Full verification and visual QA

**Files:**
- Modify only intended implementation files when a verification failure identifies a concrete defect.

**Interfaces:**
- Verifies all interfaces produced by Tasks 1–7.

- [ ] **Step 1: Run the full web suite**

```bash
docker compose run --rm --no-deps -w /app web pnpm test:web
```

Expected: `property-shell.spec.mjs` and all TypeScript specs PASS.

- [ ] **Step 2: Run package checks and repository verification**

```bash
docker compose run --rm --no-deps -w /app web pnpm --filter @roomlog/types typecheck
docker compose run --rm --no-deps -w /app web pnpm --filter @roomlog/ui typecheck
bash scripts/verify.sh
```

Expected: typechecks and all five verify stages succeed. If host `pnpm` is unavailable, execute `bash scripts/verify.sh` in a repository development container with the repository mounted at `/app`.

- [ ] **Step 3: Rebuild and inspect the standard stack**

```bash
docker compose up -d --build web api
docker compose ps
docker compose logs --tail=100 web
```

Expected: web, api, and postgres are running; web log has no build/runtime error.

- [ ] **Step 4: Verify authenticated desktop behavior**

At 1440px and 1024px confirm: `/manager` redirect; every sidebar route; correct active parent/child; no permanent ID-bound detail links; `데모` marks on home 02–05; KPI/queue/lists/right AI rail; contract summary and locked chat; non-dashboard AI launcher; no launcher on realtime; dialog button/Escape/focus restoration; prompt prefill without submit.

- [ ] **Step 5: Verify narrow behavior and mobile exclusions**

Below 860px confirm sidebar open/close and `aria-expanded`, rail below content, internal table scrolling, safe-area launcher, and retained `PhoneFrame` on `/manager/vox/00` and `/manager/ticket/call/00`.

- [ ] **Step 6: Inspect style and diff hygiene**

```bash
rg -n "#[0-9a-fA-F]{3,8}|rgba?\(|linear-gradient|radial-gradient" \
  apps/web/src/app/manager/_components packages/ui/src/components/ManagerShell.tsx
sed -n '/manager-workspace:start/,/manager-workspace:end/p' \
  apps/web/src/app/manager/globals.css | \
  rg -n "#[0-9a-fA-F]{3,8}|rgba?\(|linear-gradient|radial-gradient"
git diff --check
git status --short
```

Expected: no raw-color/gradient matches in new shell code, `git diff --check` is silent, and only intended files differ.

- [ ] **Step 7: Commit concrete verification fixes if any**

```bash
git add packages/ui/src apps/web/src/app/manager apps/web/src/lib apps/web/property-shell.spec.mjs
git commit -m "fix(manager): finish workspace visual verification"
```

Do not create this commit if Step 4–6 required no code changes.
