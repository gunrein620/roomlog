# Manager Messaging Secondary Badges Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the tenant ID and context type badges from the manager messaging detail context card.

**Architecture:** Keep the existing `ContextCard` and its primary location and pending-request badges. Add source regression assertions, remove the two secondary badge elements, and remove the now-unused `CONTEXT_LABEL` import.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, pnpm

## Global Constraints

- Remove the `thread.tenantId` badge.
- Remove the `CONTEXT_LABEL[thread.context]` badge.
- Keep the `locationLabel` and conditional `추가요청 대기` badges.
- Keep the `thread.contextLabel ?? "일반 문의"` title.
- Do not modify infrastructure files.

---

### Task 1: Remove only the two secondary badges

**Files:**
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`

**Interfaces:**
- Consumes: the existing `detailPage` source fixture and `ContextCard({ thread }: { thread: Thread })`.
- Produces: a context card without tenant ID and context type badges, while preserving its primary context UI.

- [x] **Step 1: Write the failing regression test**

Add this test to `apps/web/src/lib/messaging-thread-location.spec.ts`:

```ts
test("hides secondary context badges while keeping primary context", () => {
  assert.doesNotMatch(detailPage, /<Badge>\{thread\.tenantId\}<\/Badge>/);
  assert.doesNotMatch(detailPage, /<Badge>\{CONTEXT_LABEL\[thread\.context\]\}<\/Badge>/);
  assert.match(detailPage, /<Badge emphasis>\{locationLabel\}<\/Badge>/);
  assert.match(detailPage, /thread\.pendingRequest \? <Badge emphasis>추가요청 대기<\/Badge>/);
  assert.match(detailPage, /thread\.contextLabel \?\? "일반 문의"/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: FAIL because the detail page still contains `<Badge>{thread.tenantId}</Badge>`.

- [x] **Step 3: Remove the badge elements and unused import**

Delete these elements from `ContextCard`:

```tsx
<Badge>{thread.tenantId}</Badge>
<Badge>{CONTEXT_LABEL[thread.context]}</Badge>
```

Remove `CONTEXT_LABEL` from the `../_components` import. Keep these elements unchanged:

```tsx
<Badge emphasis>{locationLabel}</Badge>
{thread.pendingRequest ? <Badge emphasis>추가요청 대기</Badge> : null}
<div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{thread.contextLabel ?? "일반 문의"}</div>
```

- [x] **Step 4: Run focused verification**

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: all messaging thread location tests PASS with no failures.

- [x] **Step 5: Commit and push the validated slice**

```bash
git add apps/web/src/lib/messaging-thread-location.spec.ts apps/web/src/app/manager/messaging/04/page.tsx docs/superpowers/plans/2026-07-15-manager-messaging-secondary-badges-removal.md
git commit -m "fix: hide messaging secondary badges"
git push origin kms-manager-chat
```
