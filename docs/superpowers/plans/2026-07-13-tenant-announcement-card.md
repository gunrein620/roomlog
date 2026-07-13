# Tenant Announcement Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the latest manager-approved announcement on the targeted tenant's integrated `/living` page and refresh it when messaging activity arrives.

**Architecture:** Keep the existing manager send flow and tenant announcement API unchanged. Add a small pure web model that selects the latest announcement, then let the client-only `TenantMyPage` fetch the authenticated BFF route and subscribe to the existing `roomlog:activity` socket signal. Preserve truthful loading, empty, and error states without demo fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Socket.IO client, NestJS, Node test runner

## Global Constraints

- Only announcements created by the existing approve-and-send action may appear.
- Tenant authorization and recipient filtering remain server-owned.
- The card displays one latest announcement by `sentAt`.
- API failure must not be presented as an empty announcement list.
- Do not change Docker, deployment, environment, or other infrastructure files.
- Preserve all unrelated untracked files.

---

### Task 1: Latest Announcement Selection Model

**Files:**
- Create: `apps/web/src/app/my/flows/tenant-announcement-card.ts`
- Create: `apps/web/src/app/my/flows/tenant-announcement-card.spec.ts`

**Interfaces:**
- Consumes: `Announcement[]` from `@roomlog/types`.
- Produces: `latestTenantAnnouncement(announcements: readonly Announcement[]): Announcement | null`.

- [ ] **Step 1: Write the failing selection tests**

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Announcement } from "@roomlog/types";
import { latestTenantAnnouncement } from "./tenant-announcement-card";

const announcement = (id: string, sentAt: string): Announcement => ({
  id,
  category: "life",
  scope: "building",
  targetLabel: "정글빌라",
  title: id,
  body: `${id} 내용`,
  sender: "관리인",
  sentAt,
  confirmRequired: false,
  state: "unread",
});

describe("tenant announcement card", () => {
  it("returns null when the tenant has no delivered announcements", () => {
    assert.equal(latestTenantAnnouncement([]), null);
  });

  it("returns the newest delivered announcement without mutating the response", () => {
    const older = announcement("older", "2026-07-12T09:00:00+09:00");
    const newer = announcement("newer", "2026-07-13T09:00:00+09:00");
    const response = [older, newer];

    assert.equal(latestTenantAnnouncement(response)?.id, "newer");
    assert.deepEqual(response, [older, newer]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-announcement-card.spec.ts`

Expected: FAIL because `./tenant-announcement-card` does not exist.

- [ ] **Step 3: Implement the minimal selector**

```ts
import type { Announcement } from "@roomlog/types";

export function latestTenantAnnouncement(
  announcements: readonly Announcement[],
): Announcement | null {
  return announcements.reduce<Announcement | null>((latest, current) => {
    if (!latest || current.sentAt.localeCompare(latest.sentAt) > 0) return current;
    return latest;
  }, null);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: 2 tests pass.

### Task 2: Integrated Tenant Page Fetch and Refresh

**Files:**
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx:5-15,123-284,417-426`
- Modify: `apps/web/property-shell.spec.mjs:922-960`

**Interfaces:**
- Consumes: `GET /api/tenant/messaging/announcements`, `latestTenantAnnouncement`, and `getRealtimeSocket()`.
- Produces: a card with loading, ready, empty, and error states and a detail URL `/tenant/messaging/02?id=<id>`.

- [ ] **Step 1: Replace the stale static expectations with failing integration-contract assertions**

Update the tenant dashboard source-contract test so it:

```js
assert.match(pageSource, /\/api\/tenant\/messaging\/announcements/);
assert.match(pageSource, /roomlog:activity/);
assert.match(pageSource, /공지사항을 확인하고 있습니다\./);
assert.match(pageSource, /임대인으로부터 전달된 새로운 소식이 없습니다\./);
assert.match(pageSource, /공지사항을 불러오지 못했습니다\. 잠시 후 다시 확인해 주세요\./);
assert.match(pageSource, /\/tenant\/messaging\/02\?id=/);
assert.doesNotMatch(pageSource, /"에어컨 수리"|"세면대 교체"/);
```

Keep the existing resident dashboard structural assertions, but remove the deleted demo repair labels from the expected label loop.

- [ ] **Step 2: Run the focused contract test and verify RED**

Run: `cd apps/web && node --test --test-name-pattern='gives tenants a real resident dashboard' property-shell.spec.mjs`

Expected: FAIL because the BFF path, socket event, loading/error copy, and detail URL are absent.

- [ ] **Step 3: Implement announcement state and authenticated loading**

In `TenantMyPage.tsx`:

- Import `Announcement` from `@roomlog/types`.
- Import `getRealtimeSocket` and `latestTenantAnnouncement`.
- Add `TenantAnnouncementState` with `loading | ready | empty | error` status and optional announcement.
- Add a memoized `loadAnnouncements` that fetches `/api/tenant/messaging/announcements` with `cache: "no-store"`, rejects non-2xx responses, validates an array response, and uses `latestTenantAnnouncement`.
- Preserve the current successful card while a background refresh runs; only initial load shows the loading state.
- On first load, socket `roomlog:activity`, window focus, and visible `visibilitychange`, call `loadAnnouncements`.
- Remove every listener on cleanup and prevent state updates after unmount.

- [ ] **Step 4: Render truthful card states and the existing detail route**

Render:

```tsx
{announcementState.status === "ready" ? (
  <Link href={`/tenant/messaging/02?id=${encodeURIComponent(announcementState.announcement.id)}`}>
    <h3>{announcementState.announcement.title}</h3>
    <p>{announcementState.announcement.body}</p>
  </Link>
) : (
  <div>
    <h3>집주인 공지사항</h3>
    <p>{announcementStatusMessage}</p>
  </div>
)}
```

Keep the existing icon and watermark styling. Include sender and formatted `sentAt` as secondary text for the ready state.

- [ ] **Step 5: Run selector and focused contract tests and verify GREEN**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-announcement-card.spec.ts
node --test --test-name-pattern='gives tenants a real resident dashboard' property-shell.spec.mjs
```

Expected: all focused tests pass.

### Task 3: Server Delivery Visibility Regression

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts:3723-3804`

**Interfaces:**
- Consumes: existing `createManagerAnnouncementDraft`, `sendManagerAnnouncementDraft`, and `listTenantMessagingAnnouncements` service APIs.
- Produces: proof that drafts are hidden and sent deliveries appear for the target tenant.

- [ ] **Step 1: Add a failing visibility assertion before and after send**

In the existing urgent announcement test, add:

```ts
assert.equal(
  service.listTenantMessagingAnnouncements("tenant-demo").some((item) => item.draftId === reviewedDraft.id),
  false,
);

const sent = service.sendManagerAnnouncementDraft("landlord-demo", reviewedDraft.id);
const tenantList = service.listTenantMessagingAnnouncements("tenant-demo");
assert.equal(tenantList[0]?.id, sent.announcementId);
assert.equal(tenantList[0]?.title, reviewedDraft.title);
```

To preserve a genuine RED cycle, first assert a wished-for sent title that is deliberately absent before the send call, run the focused test and confirm the failure, then place the final assertion after the send call.

- [ ] **Step 2: Run the focused API test and verify RED**

Run: `pnpm --filter api exec node --test --test-name-pattern='requires reviewed urgent announcement translations' -r ts-node/register src/roomlog/roomlog.service.spec.ts`

Expected: FAIL because the pre-send tenant list cannot contain the new draft's announcement.

- [ ] **Step 3: Move the sent visibility assertion to the correct post-send behavior**

Keep the negative pre-send assertion and assert the new announcement is first in the tenant list after `sendManagerAnnouncementDraft`.

- [ ] **Step 4: Run the focused API test and verify GREEN**

Run the Step 2 command again.

Expected: the focused service test passes.

### Task 4: Full Verification

**Files:**
- Verify only; no production changes expected.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: regression evidence for web and API.

- [ ] **Step 1: Run web unit and contract suites**

Run: `pnpm --filter web test`

Expected: all web tests pass. If unrelated stale expectations fail, update only expectations already invalidated by current `main`, without changing production behavior.

- [ ] **Step 2: Run API tests**

Run: `pnpm --filter api test`

Expected: all API tests pass; DB-dependent tests may report their documented skip when PostgreSQL is unavailable.

- [ ] **Step 3: Run build verification**

Run: `bash scripts/verify.sh`

Expected: types, UI, web, and API verification succeeds. Record any environment-only Docker or database limitation separately.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- apps/web/src/app/my/flows/tenant-announcement-card.ts apps/web/src/app/my/flows/tenant-announcement-card.spec.ts apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/property-shell.spec.mjs apps/api/src/roomlog/roomlog.service.spec.ts
```

Expected: no whitespace errors and no unrelated tracked changes.

- [ ] **Step 5: Commit the verified implementation**

```bash
git add apps/web/src/app/my/flows/tenant-announcement-card.ts \
  apps/web/src/app/my/flows/tenant-announcement-card.spec.ts \
  apps/web/src/app/my/flows/TenantMyPage.tsx \
  apps/web/property-shell.spec.mjs \
  apps/api/src/roomlog/roomlog.service.spec.ts \
  docs/superpowers/plans/2026-07-13-tenant-announcement-card.md
git commit -m "fix(tenant): show delivered landlord announcements"
```
