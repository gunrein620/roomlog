# Manager Messaging Guidance Cards Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three manager messaging guidance card areas while preserving their related action buttons and AI reply draft card.

**Architecture:** Add source-level regression assertions to the existing messaging detail test. Delete the selected `NoticeCard` blocks and their payment-context branch, then remove the unused `NoticeCard` import and `isPayment` variable.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, pnpm

## Global Constraints

- Remove `추가 요청`, `맥락 톤`, `청구 맥락 톤 가드`, and `음성 답장 확인 1스텝` cards.
- Keep `사진 요청`, `설명 요청`, and `음성 받아쓰기 → 텍스트 확인` buttons.
- Keep the `AI 답장 초안` card and `초안 적용` button.
- Do not modify infrastructure files.

---

### Task 1: Remove guidance cards while preserving actions

**Files:**
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/04/page.tsx`

**Interfaces:**
- Consumes: the existing `detailPage` source fixture and manager messaging detail aside.
- Produces: a simplified aside containing the existing action buttons and AI reply draft without the selected guidance cards.

- [x] **Step 1: Write the failing regression test**

Add this test to `apps/web/src/lib/messaging-thread-location.spec.ts`:

```ts
test("hides guidance cards while keeping their actions", () => {
  assert.doesNotMatch(detailPage, /추가 요청/);
  assert.doesNotMatch(detailPage, /맥락 톤/);
  assert.doesNotMatch(detailPage, /청구 맥락 톤 가드/);
  assert.doesNotMatch(detailPage, /음성 답장 확인 1스텝/);
  assert.match(detailPage, /<StaticButton>사진 요청<\/StaticButton>/);
  assert.match(detailPage, /<StaticButton>설명 요청<\/StaticButton>/);
  assert.match(detailPage, /<StaticButton>음성 받아쓰기 → 텍스트 확인<\/StaticButton>/);
  assert.match(detailPage, />AI 답장 초안<\/div>/);
  assert.match(detailPage, /<StaticButton>초안 적용<\/StaticButton>/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: FAIL because the detail page still contains `<NoticeCard title="추가 요청">`.

- [x] **Step 3: Remove the guidance blocks and unused code**

Delete the `추가 요청` `NoticeCard`, the complete `isPayment ? ... : ...` tone-card block, and the `음성 답장 확인 1스텝` `NoticeCard`. Remove `NoticeCard` from the `../_components` import and delete:

```ts
const isPayment = thread.context === "payment";
```

Keep the three request/voice `StaticButton` elements and the complete AI reply draft `Card` unchanged.

- [x] **Step 4: Run focused verification**

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/messaging-thread-location.spec.ts
```

Expected: all messaging thread location tests PASS with no failures.

- [x] **Step 5: Commit and push the validated slice**

```bash
git add apps/web/src/lib/messaging-thread-location.spec.ts apps/web/src/app/manager/messaging/04/page.tsx docs/superpowers/plans/2026-07-15-manager-messaging-guidance-cards-removal.md
git commit -m "fix: hide messaging guidance cards"
git push origin kms-manager-chat
```
