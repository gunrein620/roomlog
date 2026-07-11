# Manager Messaging Thread Back Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 채팅 상세에서 뒤로가기 화살표를 본문이 아니라 관리자 셸의 `소통` 제목 왼쪽에 표시한다.

**Architecture:** 메시징 레이아웃이 경로를 인식하는 작은 클라이언트 제목 컴포넌트를 `ManagerAppShell`에 전달한다. 제목 컴포넌트는 `/manager/messaging/04`에서만 소통 허브 링크를 렌더링하고, 상세 페이지는 본문 화살표를 제거한 기존 `ScreenHeader` 구조로 돌아간다.

**Tech Stack:** Next.js 16 App Router, React 19, Node.js test runner, lucide-react

## Global Constraints

- 화살표는 `/manager/messaging/04`에서만 표시한다.
- 링크 대상은 `MANAGER_MESSAGING_ROUTES["M-MSG-00"]`이다.
- `/00`, `/01`, `/02`, `/03`, `/e0`의 셸 제목은 기존 `소통` 표시를 유지한다.
- 공용 `ManagerAppShell`, `@roomlog/ui`의 `ManagerShell`, 인프라 파일은 수정하지 않는다.
- 스타일 값은 기존 CSS 변수만 사용하며 raw hex를 추가하지 않는다.

---

### Task 1: 메시징 상세 셸 제목 뒤로가기 링크

**Files:**
- Create: `apps/web/src/app/manager/messaging/MessagingShellTitle.tsx`
- Modify: `apps/web/src/app/manager/messaging/layout.tsx`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `usePathname(): string`, `MANAGER_MESSAGING_ROUTES["M-MSG-00"]`
- Produces: `MessagingShellTitle(): ReactNode`

- [ ] **Step 1: Write the failing regression test**

```js
const managerMessagingLayoutSource = readFileSync(new URL("./src/app/manager/messaging/layout.tsx", import.meta.url), "utf8");
const managerMessagingShellTitlePath = new URL("./src/app/manager/messaging/MessagingShellTitle.tsx", import.meta.url);
const managerMessagingShellTitleSource = existsSync(managerMessagingShellTitlePath)
  ? readFileSync(managerMessagingShellTitlePath, "utf8")
  : "";

test("manager messaging thread places its back link beside the shell title", () => {
  assert.equal(existsSync(managerMessagingShellTitlePath), true);
  assert.match(managerMessagingLayoutSource, /title=\{<MessagingShellTitle \/>\}/);
  assert.match(managerMessagingShellTitleSource, /usePathname/);
  assert.match(managerMessagingShellTitleSource, /pathname === MANAGER_MESSAGING_ROUTES\["M-MSG-04"\]/);
  assert.match(managerMessagingShellTitleSource, /aria-label="소통 허브로 돌아가기"/);
  assert.match(managerMessagingShellTitleSource, /href=\{MANAGER_MESSAGING_ROUTES\["M-MSG-00"\]\}/);
  assert.doesNotMatch(managerMessagingThreadSource, /aria-label="소통 허브로 돌아가기"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web exec node --test --test-name-pattern="manager messaging thread places" property-shell.spec.mjs`

Expected: FAIL because `MessagingShellTitle.tsx` does not exist.

- [ ] **Step 3: Implement the route-aware shell title**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";

export function MessagingShellTitle() {
  const pathname = usePathname();

  if (pathname !== MANAGER_MESSAGING_ROUTES["M-MSG-04"]) {
    return <>소통</>;
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)" }}>
      <Link
        href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]}
        aria-label="소통 허브로 돌아가기"
        style={{
          width: "calc(var(--touch-target) - var(--space-sm))",
          height: "calc(var(--touch-target) - var(--space-sm))",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderRadius: "var(--radius-btn)",
          color: "var(--on-surface)",
          textDecoration: "none",
        }}
      >
        <ArrowLeft aria-hidden="true" />
      </Link>
      <span>소통</span>
    </span>
  );
}
```

Import `MessagingShellTitle` in `layout.tsx` and pass `title={<MessagingShellTitle />}`. Remove the `Link`, `ArrowLeft`, and outer back-link wrapper from `04/page.tsx`, leaving `ScreenHeader` with the delete form as its only action.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter web exec node --test --test-name-pattern="manager messaging thread places" property-shell.spec.mjs`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, ui, web, api builds and API smoke all pass.

- [ ] **Step 6: Rebuild and verify the Docker UI**

Run: `docker compose up -d --build web`

Verify in the browser:
- `/manager/messaging/04?id=<existing-thread-id>` exposes one `소통 허브로 돌아가기` link beside the shell `소통` heading.
- The detail content heading has no back link.
- Clicking the shell link navigates to `/manager/messaging/00`.

- [ ] **Step 7: Commit and push**

```bash
git add apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/MessagingShellTitle.tsx apps/web/src/app/manager/messaging/layout.tsx apps/web/src/app/manager/messaging/04/page.tsx docs/superpowers/plans/2026-07-11-manager-messaging-thread-back-link.md
git commit -m "fix(messaging): move thread back link to shell title"
git push origin kms-commu
```
