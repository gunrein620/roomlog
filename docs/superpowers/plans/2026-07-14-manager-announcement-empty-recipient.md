# Manager Announcement Empty Recipient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계약 세입자가 없는 공지는 검토 화면에서 발송을 차단하고, 발송 API의 업무 오류를 전체 화면 서버 오류 대신 검토 화면 안에서 안내한다.

**Architecture:** 검토 화면의 수신 가능 여부는 순수 상태 모델로 분리해 단위 테스트한다. 발송은 별도 서버 액션과 클라이언트 폼으로 분리하고 `useActionState`를 통해 오류를 같은 화면에 표시한다. API의 `TenantRoom` 기반 수신자 검증은 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, TypeScript, Node test runner, `@roomlog/ui`

## Global Constraints

- 작업 브랜치는 `kms-notice`다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 인프라 파일은 수정하지 않는다.
- 스타일은 기존 UI 컴포넌트와 `var(--...)` 토큰만 사용한다.
- 기능별로 RED → GREEN → 대상 테스트 → 웹 전체 테스트 → 커밋 → `origin/kms-notice` 푸시 순서를 지킨다.
- 기존 미추적 `docs/superpowers/**` 파일은 작업 범위에 포함하지 않는다.
- 빈 호실에 테스트 세입자나 `TenantRoom` 관계를 자동 생성하지 않는다.

---

### Task 1: 빈 수신자 상태와 발송 버튼 차단

**Files:**
- Create: `apps/web/src/app/manager/messaging/02/review-state.ts`
- Create: `apps/web/src/app/manager/messaging/02/review-state.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`

**Interfaces:**
- Consumes: `recipients.length` from `listAnnouncementRecipients(draft.id)`
- Produces: `announcementRecipientState(recipientCount): { canSend: boolean; emptyMessage?: string }`

- [ ] **Step 1: Write the failing state-model tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announcementRecipientState } from "./review-state";

describe("manager announcement recipient state", () => {
  it("blocks sending and explains an empty contract recipient list", () => {
    assert.deepEqual(announcementRecipientState(0), {
      canSend: false,
      emptyMessage: "연결된 계약 세입자가 없습니다. 계약 세입자를 연결한 뒤 발송해 주세요.",
    });
  });

  it("allows sending when at least one contract tenant is linked", () => {
    assert.deepEqual(announcementRecipientState(1), { canSend: true });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/02/review-state.spec.ts
```

Expected: FAIL because `review-state.ts` and `announcementRecipientState` do not exist.

- [ ] **Step 3: Implement the minimal state model**

```ts
export interface AnnouncementRecipientState {
  canSend: boolean;
  emptyMessage?: string;
}

export function announcementRecipientState(recipientCount: number): AnnouncementRecipientState {
  if (recipientCount <= 0) {
    return {
      canSend: false,
      emptyMessage: "연결된 계약 세입자가 없습니다. 계약 세입자를 연결한 뒤 발송해 주세요.",
    };
  }

  return { canSend: true };
}
```

- [ ] **Step 4: Render the empty state and disable the submit button**

In `page.tsx`, compute `const recipientState = announcementRecipientState(recipients.length)`. Render the existing recipient rows when `canSend` is true. Otherwise render a `NoticeCard` with `recipientState.emptyMessage`. Pass `disabled={!recipientState.canSend}` to the `승인하고 발송` button.

- [ ] **Step 5: Verify GREEN and run the feature gate**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/02/review-state.spec.ts
cd ../..
pnpm test:web
pnpm --filter web build
```

Expected: focused tests pass, web tests have 0 failures, and the Next.js build exits 0.

- [ ] **Step 6: Commit and push Task 1**

```bash
git add apps/web/src/app/manager/messaging/02/review-state.ts \
  apps/web/src/app/manager/messaging/02/review-state.spec.ts \
  apps/web/src/app/manager/messaging/02/page.tsx
git commit -m "fix(messaging): 수신자 없는 공지 발송 차단"
git push origin kms-notice
```

### Task 2: 발송 업무 오류를 검토 화면 안에 표시

**Files:**
- Create: `apps/web/src/app/manager/messaging/02/actions.ts`
- Create: `apps/web/src/app/manager/messaging/02/AnnouncementSendForm.tsx`
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `sendAnnouncementDraft(draftId): Promise<AnnouncementResult>`
- Produces: `sendAnnouncementAction(previousState, formData): Promise<{ error?: string }>`
- Produces: `<AnnouncementSendForm draftId canSend />`

- [ ] **Step 1: Write a failing source-contract regression test**

Add source reads for `02/actions.ts` and `02/AnnouncementSendForm.tsx`, then assert:

```js
test("manager announcement send keeps business errors inside the review screen", () => {
  assert.match(managerMessagingSendFormSource, /useActionState/);
  assert.match(managerMessagingSendFormSource, /role="alert"/);
  assert.match(managerMessagingSendFormSource, /disabled=\{!canSend \|\| pending\}/);
  assert.match(managerMessagingReviewActionSource, /error instanceof ApiError/);
  assert.match(managerMessagingReviewActionSource, /return \{ error:/);
  assert.doesNotMatch(managerMessagingReviewActionSource, /throw error/);
});
```

- [ ] **Step 2: Run the property test and verify RED**

```bash
cd apps/web
node --test property-shell.spec.mjs
```

Expected: FAIL because the dedicated action and form files do not exist or do not contain the required behavior.

- [ ] **Step 3: Implement the server action**

Create `actions.ts` with:

```ts
"use server";

import { redirect } from "next/navigation";
import { sendAnnouncementDraft } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";

export interface SendAnnouncementActionState {
  error?: string;
}

export async function sendAnnouncementAction(
  _previousState: SendAnnouncementActionState,
  formData: FormData,
): Promise<SendAnnouncementActionState> {
  const draftId = String(formData.get("draftId") ?? "").trim();
  if (!draftId) return { error: "발송할 공지 초안을 찾을 수 없습니다." };

  let result;
  try {
    result = await sendAnnouncementDraft(draftId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    return {
      error: error instanceof ApiError
        ? error.message
        : "공지 발송 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  redirect(`${MANAGER_MESSAGING_ROUTES["M-MSG-03"]}?id=${encodeURIComponent(result.announcementId)}`);
}
```

- [ ] **Step 4: Implement the client action form and use it from the page**

Create `AnnouncementSendForm.tsx` using `useActionState(sendAnnouncementAction, {})`. Render `state.error` in an element with `role="alert"`, preserve the hidden `draftId`, and disable the button with `disabled={!canSend || pending}`. Replace the inline server action and form in `page.tsx` with this component.

- [ ] **Step 5: Verify GREEN and run the feature gate**

```bash
cd apps/web
node --test property-shell.spec.mjs
cd ../..
pnpm test:web
pnpm --filter web build
```

Expected: property tests pass, web tests have 0 failures, and the Next.js build exits 0.

- [ ] **Step 6: Commit and push Task 2**

```bash
git add apps/web/src/app/manager/messaging/02/actions.ts \
  apps/web/src/app/manager/messaging/02/AnnouncementSendForm.tsx \
  apps/web/src/app/manager/messaging/02/page.tsx \
  apps/web/property-shell.spec.mjs
git commit -m "fix(messaging): 공지 발송 오류를 화면에 표시"
git push origin kms-notice
```

### Task 3: Full verification and browser regression

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: Task 1 and Task 2 completed behavior
- Produces: verified Docker/browser evidence

- [ ] **Step 1: Run repository verification**

```bash
pnpm test:web
pnpm test:api
bash scripts/verify.sh
```

Expected: web and API tests report 0 failures; DB-dependent skips are allowed; `verify.sh` ends with `전체 통과`.

- [ ] **Step 2: Rebuild the standard local Docker stack**

```bash
docker compose up -d --build web api
docker compose ps
curl -fsS http://localhost:4000/api/health
```

Expected: web, api, and postgres are running; API health returns `status: ok` and database `status: ok`.

- [ ] **Step 3: Verify in the browser**

Open the existing empty-recipient draft review page. Confirm the empty-state explanation is visible, the send button is disabled, and clicking cannot navigate to the Next.js server-error page. With an actually linked recipient draft, confirm successful send still routes to `/manager/messaging/03` when available without fabricating local relationships.

- [ ] **Step 4: Inspect final git state**

```bash
git diff --check
git status --short --branch
git rev-parse HEAD
git rev-parse origin/kms-notice
```

Expected: HEAD matches `origin/kms-notice`; only pre-existing unrelated untracked documents remain.

### Task 4: 빈 수신자 발송 버튼의 시각 상태 보완

**Files:**
- Modify: `apps/web/src/app/manager/messaging/02/AnnouncementSendForm.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `canSend: boolean`, `pending: boolean`
- Produces: 수신자 0명일 때 `수신자 없음` 문구와 회색 토큰 스타일이 적용된 disabled 버튼

- [ ] **Step 1: 회귀 테스트를 추가하고 RED 확인**

`property-shell.spec.mjs`에서 `수신자 없음`, `var(--surface-container-highest)`, `var(--on-surface-variant)`, `not-allowed`가 발송 폼에 존재하는지 검증하고 `node --test property-shell.spec.mjs`로 현재 구현이 실패하는지 확인한다.

- [ ] **Step 2: 공지 발송 폼에만 최소 구현**

`!canSend`일 때 버튼 문구를 `수신자 없음`으로 정하고, `Button`의 `style`에 회색 배경·글자·커서를 전달한다. `pending`일 때는 기존 `발송 중...` 문구를 유지한다.

- [ ] **Step 3: 기능 게이트와 전체 웹 검증**

```bash
cd apps/web && node --test property-shell.spec.mjs
cd ../.. && pnpm test:web && pnpm --filter web build
```

Expected: 대상 테스트와 웹 전체 테스트가 0 failure이고 production build가 종료 코드 0을 반환한다.

- [ ] **Step 4: Docker 화면 검증 후 커밋·푸시**

최신 web 이미지를 재빌드하고 수신자 0명 검토 화면에서 버튼이 회색 `수신자 없음`으로 렌더되는지 확인한 뒤 관련 파일만 커밋하고 `origin/kms-notice`에 푸시한다.
