# Manager Messaging Unread Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the manager's unread general-inquiry message total beside `소통·공지` and clear a thread's manager unread total when its detail page opens.

**Architecture:** Persist a separate `managerUnreadCount` on each messaging thread because the existing `unreadCount` is tenant-facing. The Nest domain increments it for tenant messages and clears it through an explicit authorized read endpoint. A client hook in the shared manager shell fetches general threads through the existing Next BFF, aggregates the count, and passes it to both desktop and mobile sidebars.

**Tech Stack:** TypeScript 5.9, NestJS 11, Next.js 16 App Router, React 19, Prisma 7, Node test runner, Docker Compose

## Global Constraints

- Work only on branch `kms-manager-chat` after reading `.local-agents/local-infra-guard.prompt.md`.
- Keep the existing tenant-facing `unreadCount` semantics unchanged.
- Only `general` threads contribute to the sidebar count.
- Use CSS variables from `packages/ui/src/tokens.css`; do not add raw hex values.
- A sidebar count failure must not block the manager workspace.
- Run and pass only this feature's scoped tests before each implementation commit and push, per user instruction.

---

### Task 1: Persist and expose manager unread state

**Files:**
- Modify: `packages/types/src/messaging.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts`
- Modify: `apps/web/src/lib/demo-messaging.ts`
- Modify: `apps/web/src/lib/messaging-building-filter.spec.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260715000000_add_manager_messaging_unread_count/migration.sql`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Produces: `Thread.managerUnreadCount: number`
- Produces: `RoomlogService.markManagerMessagingThreadRead(managerId: string, threadId: string): MessagingThread`
- Produces: `POST /manager/messaging/threads/:threadId/read`
- Preserves: `Thread.unreadCount` as the tenant unread count

- [ ] **Step 1: Write the failing domain test**

Add a focused test next to the existing manager/tenant messaging tests:

```ts
it("tracks and clears manager unread general inquiry messages", () => {
  const service = new RoomlogService();
  const manager = service.signup({
    email: "manager-unread@roomlog.test",
    password: "password123!",
    passwordConfirm: "password123!",
    name: "미확인 관리자",
    phone: "010-8100-1000",
    role: "LANDLORD",
    buildingName: "미확인 빌라",
    roomNo: "101호",
    address: "서울시 성동구 미확인로 1"
  } as any);
  const tenant = service.signup({
    email: "tenant-unread@roomlog.test",
    password: "password123!",
    passwordConfirm: "password123!",
    name: "문의 임차인",
    phone: "010-8100-2000",
    role: "TENANT",
    buildingName: "미확인 빌라",
    roomNo: "101호",
    address: "서울시 성동구 미확인로 1"
  } as any);
  const thread = service.createTenantMessagingThread(tenant.userId, {
    context: "general",
    body: "확인 부탁드립니다."
  });
  assert.equal(thread.managerUnreadCount, 1);

  const second = service.addTenantMessagingThreadMessage(tenant.userId, thread.id, {
    body: "한 번 더 문의드립니다."
  });
  assert.equal(second.managerUnreadCount, 2);

  service.addManagerMessagingThreadMessage(manager.userId, thread.id, { body: "확인하겠습니다." });
  assert.equal(
    service.getManagerMessagingThread(manager.userId, thread.id).managerUnreadCount,
    2
  );

  const read = service.markManagerMessagingThreadRead(manager.userId, thread.id);
  assert.equal(read.managerUnreadCount, 0);
  assert.equal(
    service.listManagerMessagingThreads(manager.userId, "general")[0]?.managerUnreadCount,
    0
  );

  const otherManager = service.signup({
    email: "other-unread-manager@roomlog.test",
    password: "password123!",
    passwordConfirm: "password123!",
    name: "외부 관리자",
    phone: "010-8100-3000",
    role: "LANDLORD",
    buildingName: "외부 빌라",
    roomNo: "1호",
    address: "서울시 성동구 외부로 1"
  } as any);
  assert.throws(
    () => service.markManagerMessagingThreadRead(otherManager.userId, thread.id),
    /메시지 스레드를 찾을 수 없습니다/
  );
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register --test-name-pattern="tracks and clears manager unread" src/roomlog/roomlog.service.spec.ts
```

Expected: FAIL because `managerUnreadCount` and `markManagerMessagingThreadRead` do not exist.

- [ ] **Step 3: Add the shared and persistence contract**

Add to both thread types:

```ts
managerUnreadCount: number; // 관리인이 아직 확인하지 않은 임차인 메시지 수
```

Add to `MessagingThread` in `prisma/schema.prisma`:

```prisma
managerUnreadCount Int @default(0)
```

Create the migration:

```sql
ALTER TABLE "MessagingThread"
ADD COLUMN "managerUnreadCount" INTEGER NOT NULL DEFAULT 0;
```

Map `managerUnreadCount: thread.managerUnreadCount` in the Prisma load/create/update projections. Add `managerUnreadCount: thread.managerUnreadCount ?? 0` in the persisted JSON normalization path in `roomlog.service.ts` so stores written before this field existed remain readable. Add `managerUnreadCount: 0` to the two web demo threads and the messaging building-filter test fixture.

- [ ] **Step 4: Implement domain increment and authorized clear**

Initialize every new thread literal found beside the existing `unreadCount` fields in `roomlog-messaging.domain.ts` and `roomlog.service.ts` with zero; the existing shared append path records the actual first sender exactly once:

```ts
managerUnreadCount: 0,
```

Update the shared message append path without changing tenant unread behavior:

```ts
if (message.sender === "manager") {
  thread.unreadCount += 1;
} else {
  thread.managerUnreadCount += 1;
}
```

Add the domain method:

```ts
markManagerMessagingThreadRead(managerId: string, threadId: string): MessagingThread {
  const thread = this.findManagerThread(managerId, threadId);
  thread.managerUnreadCount = 0;
  this.persistStore();
  return this.presentThread(thread, true);
}
```

Delegate it through `RoomlogService`, then expose it in the controller:

```ts
@Post("manager/messaging/threads/:threadId/read")
markManagerMessagingThreadRead(
  @Headers("authorization") authorization: string | undefined,
  @Param("threadId") threadId: string
) {
  const user = this.requireRole(authorization, ["LANDLORD"]);
  return this.roomlogService.markManagerMessagingThreadRead(user.id, threadId);
}
```

- [ ] **Step 5: Build shared types and verify GREEN**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
pnpm --filter api exec node --test -r ts-node/register --test-name-pattern="tracks and clears manager unread" src/roomlog/roomlog.service.spec.ts
```

Expected: shared typecheck succeeds, Prisma client generation succeeds, and the focused test passes.

- [ ] **Step 6: Commit and push the passing backend slice**

```bash
git add docs/superpowers/specs/2026-07-15-manager-messaging-unread-badge-design.md docs/superpowers/plans/2026-07-15-manager-messaging-unread-badge.md packages/types/src/messaging.ts apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/services/roomlog-messaging.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/prisma-store-projector.ts apps/web/src/lib/demo-messaging.ts apps/web/src/lib/messaging-building-filter.spec.ts prisma/schema.prisma prisma/migrations/20260715000000_add_manager_messaging_unread_count/migration.sql apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat: track manager unread messages"
git push origin kms-manager-chat
```

### Task 2: Render and refresh the sidebar unread badge

**Files:**
- Create: `apps/web/src/lib/manager-messaging-unread.ts`
- Create: `apps/web/src/lib/manager-messaging-unread.spec.ts`
- Modify: `apps/web/src/lib/messaging-manager-api.ts`
- Modify: `apps/web/src/lib/messaging-api.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`
- Modify: `apps/web/src/app/manager/_components/ManagerAppShell.tsx`
- Modify: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: `Thread.managerUnreadCount`
- Consumes: `POST /manager/messaging/threads/:threadId/read`
- Produces: `totalManagerUnreadGeneralMessages(threads: readonly Thread[]): number`
- Produces: `useManagerMessagingUnreadCount(pathname: string): number`
- Produces: `ManagerSidebarProps.messagingUnreadCount?: number`

- [ ] **Step 1: Write failing aggregation and shell tests**

Create a pure helper test:

```ts
test("sums only manager unread general inquiry messages", () => {
  const threads = [
    { context: "general", managerUnreadCount: 2 },
    { context: "general", managerUnreadCount: 1 },
    { context: "defect", managerUnreadCount: 9 },
  ] as Thread[];
  assert.equal(totalManagerUnreadGeneralMessages(threads), 3);
});
```

Extend `manager-workspace-shell.spec.ts` with source assertions for:

```ts
assert.match(sidebar, /messagingUnreadCount\?: number/);
assert.match(sidebar, /aria-label=\{`미확인 메시지 \$\{messagingUnreadCount\}개`\}/);
assert.match(sidebar, /manager-sidebar__unread-badge/);
assert.match(appShellSource, /useManagerMessagingUnreadCount\(pathname\)/);
assert.match(appShellSource, /messagingUnreadCount=\{messagingUnreadCount\}/);
```

- [ ] **Step 2: Run the scoped web tests to verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/manager-messaging-unread.spec.ts src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the helper, prop, hook, and badge do not exist.

- [ ] **Step 3: Add manager read API client and use it on detail open**

Extend paths and client:

```ts
readThread: (id: string) => `/manager/messaging/threads/${encodeURIComponent(id)}/read`,

export function markManagerThreadRead(id: string): Promise<Thread> {
  return serverFetch<Thread>(managerMessagingPaths.readThread(id), { method: "POST" });
}
```

Add the path contract assertion to `messaging-api.spec.ts`:

```ts
assert.equal(
  managerMessagingPaths.readThread("mth_1"),
  "/manager/messaging/threads/mth_1/read"
);
```

In `messaging/04/page.tsx`, replace the detail GET used on initial render with `markManagerThreadRead(id)` inside the existing redirect-aware helper. The returned thread already includes messages, so do not add a second request.

- [ ] **Step 4: Add aggregate helper and resilient client hook**

Implement the pure helper and hook in `manager-messaging-unread.ts`:

```ts
"use client";

import type { Thread } from "@roomlog/types";
import { useEffect, useState } from "react";

export function totalManagerUnreadGeneralMessages(threads: readonly Thread[]): number {
  return threads.reduce(
    (total, thread) => thread.context === "general" ? total + thread.managerUnreadCount : total,
    0,
  );
}

export function useManagerMessagingUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/manager/messaging/threads?context=general", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("unread fetch failed")))
        .then((threads: Thread[]) => setCount(totalManagerUnreadGeneralMessages(threads)))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) setCount(0);
        });
    };
    load();
    const interval = window.setInterval(load, 10_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [pathname]);
  return count;
}
```

Call the hook once in `ManagerAppShell` and pass the same result to desktop and mobile `ManagerSidebar` instances.

- [ ] **Step 5: Render the accessible token-based badge**

Add the optional prop and render only for the messaging parent when the count is positive:

```tsx
<span className="manager-sidebar__label">{item.label}</span>
{isMessaging && messagingUnreadCount > 0 ? (
  <span
    className="manager-sidebar__unread-badge"
    aria-label={`미확인 메시지 ${messagingUnreadCount}개`}
  >
    {messagingUnreadCount > 99 ? "99+" : messagingUnreadCount}
  </span>
) : null}
```

Add CSS using only tokens:

```css
.manager-sidebar__parent-toggle .manager-sidebar__label {
  min-width: 0;
  flex: 1;
}

.manager-sidebar__unread-badge {
  flex: 0 0 auto;
  min-width: var(--space-xl);
  height: var(--space-xl);
  padding: 0 var(--space-xs);
  border-radius: var(--radius-btn);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: var(--on-primary);
  font-size: var(--fs-caption);
  font-weight: 800;
  line-height: 1;
}
```

Replace the existing generic `.manager-sidebar__parent-toggle span` flex rule with the label-specific rule above so the badge does not stretch.

- [ ] **Step 6: Run scoped web tests to verify GREEN**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/manager-messaging-unread.spec.ts src/app/manager/manager-workspace-shell.spec.ts src/lib/messaging-api.spec.ts src/lib/messaging-thread-location.spec.ts
```

Expected: all scoped manager messaging and shell tests pass.

- [ ] **Step 7: Rebuild Docker and verify the visible flow**

Run:

```bash
docker compose up -d --build api web
docker compose ps
```

Expected: `roomlog-api`, `roomlog-web`, and `roomlog-postgres` are running; postgres is healthy. In the browser, verify a numeric badge appears beside `소통·공지` for an unread general inquiry and decreases or disappears after opening that thread. Confirm no browser console error overlay.

- [ ] **Step 8: Commit and push the passing web slice**

```bash
git add apps/web/src/lib/manager-messaging-unread.ts apps/web/src/lib/manager-messaging-unread.spec.ts apps/web/src/lib/messaging-manager-api.ts apps/web/src/lib/messaging-api.spec.ts apps/web/src/app/manager/messaging/04/page.tsx apps/web/src/app/manager/_components/ManagerAppShell.tsx apps/web/src/app/manager/_components/ManagerSidebar.tsx apps/web/src/app/manager/globals.css apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat: show manager messaging unread badge"
git push origin kms-manager-chat
```

### Task 3: Final feature verification

**Files:**
- Verify only; no planned source changes

**Interfaces:**
- Consumes: backend unread persistence, read endpoint, and sidebar count UI from Tasks 1-2
- Produces: fresh scoped test and runtime evidence for handoff

- [ ] **Step 1: Run the complete feature test set from a fresh command**

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api exec node --test -r ts-node/register --test-name-pattern="manager unread|tenant landlord inquiry" src/roomlog/roomlog.service.spec.ts
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/manager-messaging-unread.spec.ts src/app/manager/manager-workspace-shell.spec.ts src/lib/messaging-api.spec.ts src/lib/messaging-thread-location.spec.ts
```

Expected: every selected test passes with zero failures.

- [ ] **Step 2: Confirm repository and remote state**

```bash
git status --short --branch
git log -3 --oneline
```

Expected: branch is `kms-manager-chat`, implementation commits are present and pushed, and only the user's pre-existing untracked plan/spec files remain.
