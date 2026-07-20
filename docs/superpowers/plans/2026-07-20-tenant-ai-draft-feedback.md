# Tenant AI Draft Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an immediate assistant bubble while the tenant complaint draft is generated and prefill the request body with a readable labeled format.

**Architecture:** Keep the existing intake API and request-sheet transition unchanged. Add the progress copy to the existing chat message state and isolate request-body formatting in a pure function in the tenant page so missing AI fields can be omitted without inventing facts.

**Tech Stack:** Next.js 16, React, TypeScript, Node test runner

## Global Constraints

- Do not add artificial delay before opening the request sheet.
- Use the existing assistant message bubble; do not add a new UI component or raw color.
- Include only draft values returned by the intake API.
- Keep the existing no-separate-filing-button flow.

---

### Task 1: Assistant feedback and structured request body

**Files:**
- Modify: `apps/web/src/app/my/flows/tenant-ai-approval.spec.ts`
- Modify: `apps/web/src/app/my/flows/useTenantAiAssistant.ts`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`

**Interfaces:**
- Consumes: `TenantIntakeDraft` returned by `sendTenantIntakeMessage`
- Produces: `formatTenantRequestDescription(draft: TenantIntakeDraft): string`

- [ ] **Step 1: Write the failing regression assertions**

Add assertions requiring the assistant progress copy, the description formatter, its labeled sections, and suppression of the yellow notice during a submitted turn:

```ts
assert.match(hook, /접수 초안을 작성하겠습니다/);
assert.match(page, /formatTenantRequestDescription/);
assert.match(page, /\[문제 내용\]/);
assert.match(page, /\[세부 유형\]/);
assert.match(page, /\[요청 사항\]/);
assert.doesNotMatch(page, /className="manager-ai-notice"/);
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run:

```bash
pnpm --filter web exec tsx --test src/app/my/flows/tenant-ai-approval.spec.ts
```

Expected: FAIL because the progress copy and formatter do not exist.

- [ ] **Step 3: Add the assistant progress message**

In `submitText`, append the standard assistant message immediately after the tenant message:

```ts
appendMessage(
  "assistant",
  "말씀해 주신 내용으로 접수 초안을 작성하겠습니다. 잠시만 기다려 주세요.",
);
```

Keep the API request and successful sheet transition unchanged. Remove the tenant dialog's yellow `manager-ai-notice` rendering because the assistant bubble now provides the processing feedback.

- [ ] **Step 4: Add and apply the description formatter**

Import `TenantIntakeDraft` into `TenantMyPage.tsx`, define a pure formatter, and replace the direct `draft.summary` assignment:

```ts
function formatTenantRequestDescription(draft: TenantIntakeDraft): string {
  const detailCategory = draft.detailCategory?.trim() || draft.category?.trim();
  const sections = [
    `[문제 내용]\n${draft.summary.trim()}`,
    detailCategory ? `[세부 유형]\n${detailCategory}` : "",
    "[요청 사항]\n관리자 확인 후 필요한 점검을 요청드립니다.",
  ];
  return sections.filter(Boolean).join("\n\n");
}
```

```ts
description: formatTenantRequestDescription(draft),
```

- [ ] **Step 5: Run targeted test and confirm GREEN**

Run:

```bash
pnpm --filter web exec tsx --test src/app/my/flows/tenant-ai-approval.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run web tests and build**

Run:

```bash
pnpm test:web
pnpm --filter web build
```

Expected: both commands exit with code 0.

- [ ] **Step 7: Review the diff**

Run:

```bash
git diff --check
git diff -- apps/web/src/app/my/flows/tenant-ai-approval.spec.ts apps/web/src/app/my/flows/useTenantAiAssistant.ts apps/web/src/app/my/flows/TenantMyPage.tsx
```

Expected: no whitespace errors and only the approved flow changes.
