# Manager Ticket Section Navigation Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 민원·하자 대시보드에서 상단 하위 메뉴 줄을 제거하면서 좌측 사이드바 링크는 유지한다.

**Architecture:** `ManagerAppShell`은 `subnav`가 nullish일 때 기본 `ManagerSectionNav`를 렌더링하므로, ticket dash 레이아웃에서 `subnav={false}`를 명시해 해당 레이아웃에만 하위 메뉴를 비활성화한다. 네비게이션 데이터와 공용 셸은 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, Node.js test runner

## Global Constraints

- `/manager/ticket/dash/**`에서만 상단 하위 메뉴를 숨긴다.
- 좌측 사이드바의 `민원 대시보드`, `민원 대응`, `하자 관리` 링크는 유지한다.
- 공용 `ManagerAppShell`, `ManagerSectionNav`, `MANAGER_NAV_GROUPS`와 인프라 파일은 수정하지 않는다.

---

### Task 1: Ticket Dash 상단 하위 메뉴 제거

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/layout.tsx`
- Test: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

**Interfaces:**
- Consumes: `ManagerAppShellProps.subnav: ReactNode`
- Produces: `/manager/ticket/dash/**`에서 상단 `manager-section-nav`가 없는 레이아웃

- [ ] **Step 1: Write the failing test**

```ts
const layoutPath = join(root, "src/app/manager/ticket/dash/layout.tsx");
const layoutSource = readFileSync(layoutPath, "utf8");

assert.match(layoutSource, /<ManagerAppShell[\s\S]*?subnav=\{false\}/);
assert.match(navigationSource, /민원 대시보드/);
assert.match(navigationSource, /민원 대응/);
assert.match(navigationSource, /하자 관리/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: FAIL because `layout.tsx` does not pass `subnav={false}`.

- [ ] **Step 3: Implement the minimal layout override**

```tsx
<ManagerAppShell
  title="하자/민원 티켓 처리"
  context="관리 중인 집 · 하자·민원"
  subnav={false}
>
  {children}
</ManagerAppShell>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, ui, web, api builds and API smoke all pass.

- [ ] **Step 6: Rebuild and verify Docker UI**

Run: `docker compose up -d --build web`

Verify `/manager/ticket/dash/00?type=defect` has no `민원·하자 하위 메뉴` navigation in the page header while the sidebar links remain available.

- [ ] **Step 7: Commit and push**

```bash
git add apps/web/src/app/manager/ticket/dash/layout.tsx apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts docs/superpowers/plans/2026-07-11-manager-ticket-hide-section-nav.md
git commit -m "fix(ticket): remove dashboard section navigation"
git push origin kms-commu
```
