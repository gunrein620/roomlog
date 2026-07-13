# Manager Messaging Parent Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 사이드바의 `소통·공지`를 `민원·하자`와 동일한 전체 행 접힘·펼침 버튼으로 만든다.

**Architecture:** `ManagerSidebar`가 `ticket`과 `messaging`의 독립 펼침 상태를 소유한다. 두 항목은 공용 부모 토글 버튼 렌더링과 공용 CSS를 사용하고, 실제 라우팅은 기존 하위 링크만 담당한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, CSS design tokens, Node test runner, Docker Compose

## Global Constraints

- 현재 작업 브랜치는 `kms-commu`다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 추가하지 않는다.
- 인프라 파일, 메시징 화면 본문, API, 공유 타입은 수정하지 않는다.
- 기능 테스트와 전체 검증을 통과한 뒤 이번 기능 파일만 커밋하고 푸시한다.
- 기존 미추적 문서는 stage하거나 수정하지 않는다.

---

### Task 1: 소통·공지 공용 부모 토글

**Files:**
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Create: `docs/superpowers/plans/2026-07-11-manager-messaging-parent-toggle.md`

**Interfaces:**
- Consumes: `MANAGER_NAV_GROUPS`, `ManagerNavItemId`, `onNavigate`, 기존 `ticketExpanded` 동작
- Produces: `ticket`과 `messaging`이 공유하는 `.manager-sidebar__parent-toggle` 버튼 및 서로 다른 `aria-controls` 하위 메뉴 ID

- [x] **Step 1: 공용 부모 토글의 실패 회귀 테스트 작성**

`manager-workspace-shell.spec.ts`의 사이드바 검증에 다음 계약을 추가한다.

```ts
assert.match(sidebar, /const messagingActive = state\.activeItemId === "messaging"/);
assert.match(sidebar, /const \[messagingExpanded, setMessagingExpanded\] = useState\(messagingActive\)/);
assert.match(sidebar, /const isCollapsible = isTicket \|\| isMessaging/);
assert.match(sidebar, /const expanded = isTicket \? ticketExpanded : messagingExpanded/);
assert.match(sidebar, /manager-messaging-subnav/);
assert.match(sidebar, /aria-label=\{`\$\{item\.label\} 메뉴 \$\{expanded \? "접기" : "펼치기"\}`\}/);
assert.match(managerCss, /manager-sidebar__parent-toggle/);
assert.doesNotMatch(managerCss, /manager-sidebar__ticket-toggle/);
```

- [x] **Step 2: 집중 테스트를 실행해 RED 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: `messagingActive`, `messagingExpanded` 또는 공용 토글 계약이 현재 소스에 없어 assertion failure가 발생한다.

- [x] **Step 3: 독립 상태와 공용 토글 최소 구현**

`ManagerSidebar.tsx`에 메시징 상태를 추가한다.

```tsx
const messagingActive = state.activeItemId === "messaging";
const [messagingExpanded, setMessagingExpanded] = useState(messagingActive);

useEffect(() => {
  if (messagingActive) setMessagingExpanded(true);
}, [pathname, messagingActive]);
```

항목별 공용 토글 값을 계산한다.

```tsx
const isTicket = item.id === "ticket";
const isMessaging = item.id === "messaging";
const isCollapsible = isTicket || isMessaging;
const expanded = isTicket ? ticketExpanded : messagingExpanded;
const subnavId = isTicket ? "manager-ticket-subnav" : "manager-messaging-subnav";
const setExpanded = isTicket ? setTicketExpanded : setMessagingExpanded;
const showChildren = isCollapsible ? expanded : active;
```

기존 ticket 전용 분기를 공용 버튼으로 바꾼다.

```tsx
{isCollapsible ? (
  <button
    type="button"
    className={`manager-sidebar__parent-toggle${active ? " is-active" : ""}`}
    aria-expanded={expanded}
    aria-controls={subnavId}
    aria-label={`${item.label} 메뉴 ${expanded ? "접기" : "펼치기"}`}
    data-expanded={expanded}
    onClick={() => setExpanded((current) => !current)}
  >
    <Icon aria-hidden="true" />
    <span>{item.label}</span>
    <ChevronDown aria-hidden="true" />
  </button>
) : (
  <div className={`manager-sidebar__link-row${active ? " is-active" : ""}`}>
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={parentCurrent ? "page" : undefined}
      className={`manager-sidebar__link${active ? " is-active" : ""}`}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
      {item.external ? (
        <span className="manager-sidebar__external">
          <ExternalLink aria-hidden="true" />
          <span className="manager-sidebar__sr-only">관리자 워크스페이스 밖으로 이동</span>
        </span>
      ) : null}
    </Link>
  </div>
)}
```

하위 메뉴 ID는 접힘 가능한 항목에만 연결한다.

```tsx
id={isCollapsible ? subnavId : undefined}
```

- [x] **Step 4: ticket 전용 CSS를 공용 부모 토글 CSS로 변경**

`globals.css`에서 `.manager-sidebar__ticket-toggle` 선택자를 모두 `.manager-sidebar__parent-toggle`로 바꾼다. 너비, 아이콘 크기, 화살표 회전, 활성·hover·focus 스타일 값은 그대로 유지한다.

```css
.manager-sidebar__parent-toggle {
  width: 100%;
  min-height: var(--touch-target);
  display: flex;
}

.manager-sidebar__parent-toggle[data-expanded="true"] svg:last-child {
  transform: rotate(180deg);
}
```

- [x] **Step 5: 집중 테스트 GREEN 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: 8 tests pass, 0 fail.

- [x] **Step 6: 승인 해시 실패 원인을 확인하고 새 사이드바 해시만 갱신**

Run:

```bash
pnpm --filter web test:unit
```

Expected first run: 사이드바 전체 SHA-256을 고정한 `manager-defect-dashboard.spec.ts`만 의도한 소스 변경으로 실패할 수 있다. 실패 출력의 actual SHA-256을 확인한 뒤 해당 expected 값만 변경하고 같은 명령을 다시 실행한다.

Expected final run: 257 tests pass, 0 fail.

- [x] **Step 7: 저장소 전체 검증**

Run:

```bash
bash scripts/verify.sh
```

Expected: types, ui, web build, api build, api smoke가 모두 통과한다.

- [x] **Step 8: Docker web 재빌드 및 브라우저 동작 검증**

Run:

```bash
docker compose up -d --build web
```

브라우저에서 다음을 확인한다.

1. `/manager/home/00`에서 `민원·하자`, `소통·공지`가 모두 접힌 상태로 시작한다.
2. `소통·공지` 전체 행을 누르면 화살표가 회전하고 `소통 허브`, `공지 작성`이 표시된다.
3. `민원·하자`를 펼쳐도 소통·공지 상태가 유지된다.
4. 소통·공지를 다시 접어도 민원·하자 상태가 유지된다.
5. `소통 허브`를 누르면 `/manager/messaging/00`으로 이동한다.
6. 이동 후 소통·공지는 펼쳐지고 브라우저 오류 로그는 0건이다.

- [x] **Step 9: 변경 범위와 스타일 검증**

Run:

```bash
git diff --check
git diff -- apps/web/src/app/manager/globals.css | rg '^\+[^+].*#[0-9A-Fa-f]{3,8}'
```

Expected: `git diff --check`는 성공하고 raw hex 검색은 결과가 없다.

- [ ] **Step 10: 이번 기능만 커밋하고 푸시**

```bash
git add \
  apps/web/src/app/manager/_components/ManagerSidebar.tsx \
  apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts \
  docs/superpowers/plans/2026-07-11-manager-messaging-parent-toggle.md
git commit -m "fix(messaging): toggle sidebar submenu from parent row"
git push origin kms-commu
```

Expected: `origin/kms-commu`가 새 커밋을 가리키고 기존 미추적 문서는 그대로 남는다.
