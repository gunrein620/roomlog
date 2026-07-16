# Manager Messaging Context Note Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the connected-work and tenant-visibility note from the manager messaging detail context card.

**Architecture:** Keep the existing `ContextCard` structure, badges, and context title intact. Add a source-level regression assertion to the existing messaging detail test, then delete the single note element that contains the unwanted copy.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, pnpm

## Global Constraints

- Keep the `ContextCard` badges.
- Keep the `thread.contextLabel ?? "일반 문의"` title.
- Remove only `연결된 업무: <업무 ID> · 임차인에게도 같은 대화가 표시됩니다.`
- Do not modify infrastructure files.

---

### Task 1: Remove the context note without changing the context title

**Files:**
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`

**Interfaces:**
- Consumes: the existing `detailPage` source fixture and `ContextCard({ thread }: { thread: Thread })` component.
- Produces: a context card with unchanged badges and title but without the connected-work note.

- [x] **Step 1: Write the failing regression test**

Add this test to `apps/web/src/lib/messaging-thread-location.spec.ts`:

```ts
test("hides the connected-work note while keeping the context title", () => {
  assert.doesNotMatch(detailPage, /연결된 업무:/);
  assert.doesNotMatch(detailPage, /임차인에게도 같은 대화가 표시됩니다\./);
  assert.match(detailPage, /thread\.contextLabel \?\? "일반 문의"/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: FAIL because `detailPage` still contains `연결된 업무:`.

- [x] **Step 3: Remove only the unwanted note**

Delete this element from `ContextCard` in `apps/web/src/app/manager/messaging/04/page.tsx`:

```tsx
<div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: 1.5 }}>
  연결된 업무: {thread.contextRef ?? thread.id} · 임차인에게도 같은 대화가 표시됩니다.
</div>
```

Keep this title element unchanged:

```tsx
<div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{thread.contextLabel ?? "일반 문의"}</div>
```

- [x] **Step 4: Run focused verification**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: all messaging thread location tests PASS with no failures. The user approved focused verification because the pre-existing full web suite has two unrelated failures.

- [x] **Step 5: Commit and push the validated slice**

```bash
git add apps/web/src/lib/messaging-thread-location.spec.ts apps/web/src/app/manager/messaging/04/page.tsx docs/superpowers/plans/2026-07-15-manager-messaging-context-note-removal.md
git commit -m "fix: remove messaging context note"
git push origin kms-manager-chat
```
