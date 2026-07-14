# Manager Ticket Attachment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리인 민원 상세 모달에서 실제 첨부 이미지 썸네일을 표시하고 선택한 이미지를 큰 원본 오버레이로 확인할 수 있게 한다.

**Architecture:** 기존 `GET /manager/tickets` 응답에 포함된 메시지 첨부 URL을 web API 매핑 계층에서 정규화해 `DefectDashboardRow`로 전달한다. 상세 모달은 전달받은 URL만 렌더링하며, 선택 상태와 이미지 로딩 실패 상태를 컴포넌트 내부에서 관리한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, CSS custom properties

## Global Constraints

- `packages/types` 계약 변경과 API 또는 데이터베이스 스키마 변경은 하지 않는다.
- raw hex를 추가하지 않고 기존 `packages/ui/src/tokens.css` CSS 변수만 사용한다.
- 이미지 URL이 없는 과거 파일명 기록은 현재 상세 설명의 텍스트 표시를 유지한다.
- compose, Dockerfile, workflow, 배포 환경 변수는 수정하지 않는다.
- 각 Task는 실패 테스트 확인, 대상 테스트 통과, 커밋, `kms-complain` push까지 완료한 뒤 다음 Task로 진행한다.

---

## File Structure

- `apps/web/src/lib/manager-mapping.ts`: 팀 티켓 응답의 메시지 첨부 타입을 선언한다.
- `apps/web/src/lib/ticket-manager-api.ts`: 메시지 첨부 URL을 정리하고 대시보드 행에 전달한다.
- `apps/web/src/lib/ticket-manager-api.spec.ts`: URL 정리와 대시보드 매핑 계약을 검증한다.
- `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts`: 행 단위 `attachmentUrls` 계약을 소유한다.
- `apps/web/src/app/manager/ticket/dash/00/TicketDetailDialog.tsx`: 썸네일, 큰 원본 오버레이, 닫기 및 실패 대체 UI를 담당한다.
- `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`: 상세 모달 UI 및 CSS 계약을 검증한다.
- `apps/web/src/app/manager/globals.css`: 상세 모달 첨부 썸네일과 큰 이미지 오버레이 스타일을 정의한다.

---

### Task 1: 티켓 첨부 URL 매핑

**Files:**
- Modify: `apps/web/src/lib/manager-mapping.ts`
- Modify: `apps/web/src/lib/ticket-manager-api.ts`
- Create: `apps/web/src/lib/ticket-manager-api.spec.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts`

**Interfaces:**
- Consumes: `TeamManagerTicket.messages?: Array<{ attachmentUrls?: string[] }>`
- Produces: `managerTicketAttachmentUrls(ticket: TeamManagerTicket): string[]`
- Produces: `DefectDashboardRow.attachmentUrls?: string[]`

- [ ] **Step 1: Write the failing attachment normalization test**

Create `apps/web/src/lib/ticket-manager-api.spec.ts` with a test that imports `managerTicketAttachmentUrls`, supplies blank and duplicate URLs across messages, and expects stable first-seen order:

```ts
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { managerTicketAttachmentUrls } from "./ticket-manager-api";
import type { TeamManagerTicket } from "./manager-mapping";

const ticket = {
  messages: [
    { attachmentUrls: [" /uploads/high.png ", "", "/uploads/high.png"] },
    { attachmentUrls: ["/uploads/wide.jpg"] },
  ],
} as TeamManagerTicket;

describe("manager ticket attachment mapping", () => {
  it("trims, removes blanks, and deduplicates attachment URLs", () => {
    assert.deepEqual(managerTicketAttachmentUrls(ticket), [
      "/uploads/high.png",
      "/uploads/wide.jpg",
    ]);
  });

  it("returns an empty list when messages or attachments are absent", () => {
    assert.deepEqual(managerTicketAttachmentUrls({} as TeamManagerTicket), []);
    assert.deepEqual(
      managerTicketAttachmentUrls({ messages: [{}] } as TeamManagerTicket),
      [],
    );
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts
```

Expected: FAIL because `managerTicketAttachmentUrls` is not exported.

- [ ] **Step 3: Add the response and dashboard row contracts**

Add to `TeamManagerTicket` in `manager-mapping.ts`:

```ts
messages?: Array<{ attachmentUrls?: string[] }>;
```

Add to `DefectDashboardRow` in `ticket-dashboard-model.ts`:

```ts
attachmentUrls?: string[];
```

- [ ] **Step 4: Implement minimal URL normalization and row mapping**

Add to `ticket-manager-api.ts`:

```ts
export function managerTicketAttachmentUrls(ticket: TeamManagerTicket): string[] {
  return Array.from(
    new Set(
      (ticket.messages ?? [])
        .flatMap((message) => message.attachmentUrls ?? [])
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}
```

Change each `listManagerTicketRows` result to include:

```ts
attachmentUrls: managerTicketAttachmentUrls(t),
```

- [ ] **Step 5: Run Task 1 tests and verify GREEN**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts src/app/manager/ticket/dash/00/local-ticket-demo.spec.ts
```

Expected: all tests PASS with no TypeScript errors.

- [ ] **Step 6: Commit and push Task 1**

```bash
git add apps/web/src/lib/manager-mapping.ts apps/web/src/lib/ticket-manager-api.ts apps/web/src/lib/ticket-manager-api.spec.ts apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts
git commit -m "feat(manager): 민원 첨부 이미지 URL 매핑"
git push origin kms-complain
```

---

### Task 2: 썸네일 및 큰 원본 미리보기 UI

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/TicketDetailDialog.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Consumes: `DefectDashboardRow.attachmentUrls?: string[]`
- Produces: `TicketDetailDialog`의 썸네일 버튼, `role="dialog"` 큰 이미지 오버레이, 닫기 동작, 이미지 실패 대체 링크

- [ ] **Step 1: Write the failing UI contract test**

Extend `manager-defect-dashboard.spec.ts` to load `TicketDetailDialog.tsx` and assert these contracts:

```ts
const ticketDetailDialogPath = join(
  root,
  "src/app/manager/ticket/dash/00/TicketDetailDialog.tsx",
);
const ticketDetailDialogSource = readFileSync(ticketDetailDialogPath, "utf8");

assert.match(ticketDetailDialogSource, /row\.attachmentUrls/);
assert.match(ticketDetailDialogSource, /manager-ticket-dialog__attachments/);
assert.match(ticketDetailDialogSource, /manager-ticket-dialog__attachment-thumbnail/);
assert.match(ticketDetailDialogSource, /manager-ticket-image-preview/);
assert.match(ticketDetailDialogSource, /aria-modal="true"/);
assert.match(ticketDetailDialogSource, /event\.key === "Escape"/);
assert.match(ticketDetailDialogSource, /onError/);
assert.match(ticketDetailDialogSource, /target="_blank"/);
assert.match(cssSource, /manager-ticket-dialog__attachment-thumbnail/);
assert.match(cssSource, /manager-ticket-image-preview/);
```

- [ ] **Step 2: Run the dashboard test and verify RED**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
```

Expected: FAIL because the attachment preview selectors and overlay do not exist.

- [ ] **Step 3: Implement thumbnail state and fallback UI**

In `TicketDetailDialog.tsx`, add `useState` for `selectedPreviewUrl` and a `Set<string>` of failed URLs. Render `row.attachmentUrls` below the description as buttons containing `<img>`. Each image `onError` adds its URL to the failed set; failed entries render an `<a target="_blank" rel="noreferrer">` using the URL filename.

The thumbnail selection handler sets `selectedPreviewUrl`. When `row` changes or closes, clear the preview and failed URL state.

- [ ] **Step 4: Implement the accessible large image overlay**

When `selectedPreviewUrl` exists, render:

```tsx
<div
  className="manager-ticket-image-preview"
  role="dialog"
  aria-modal="true"
  aria-label="첨부 이미지 크게 보기"
  onClick={closePreviewOnBackdrop}
>
  <figure className="manager-ticket-image-preview__content">
    <button type="button" aria-label="큰 이미지 닫기" onClick={closePreview}>
      <X aria-hidden="true" />
    </button>
    <img src={selectedPreviewUrl} alt={`${attachmentFileName(selectedPreviewUrl)} 원본`} />
  </figure>
</div>
```

Register a keydown effect while the preview is open so `Escape` clears only `selectedPreviewUrl`. After closing, return focus to the thumbnail button saved in a ref.

- [ ] **Step 5: Add token-only styles**

Add styles under the existing manager ticket dialog block in `globals.css`:

```css
.manager-ticket-dialog__attachments {
  display: grid;
  gap: 12px;
}

.manager-ticket-dialog__attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.manager-ticket-dialog__attachment-thumbnail {
  width: 112px;
  height: 84px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--manager-legacy-border);
  border-radius: 10px;
  background: var(--mist);
}

.manager-ticket-dialog__attachment-thumbnail img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.manager-ticket-image-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 32px;
  background: color-mix(in srgb, var(--on-surface) 72%, transparent);
}

.manager-ticket-image-preview__content {
  position: relative;
  max-width: min(960px, 100%);
  max-height: 100%;
  margin: 0;
}

.manager-ticket-image-preview__content img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 64px);
  object-fit: contain;
  border-radius: 12px;
  background: var(--surface);
}
```

The overlay color is derived from the existing semantic `--on-surface` token; do not introduce a raw color value.

- [ ] **Step 6: Run Task 2 tests and verify GREEN**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
pnpm test:web
```

Expected: dashboard contract and complete web test suite PASS.

- [ ] **Step 7: Run repository verification**

Run:

```bash
bash scripts/verify.sh
```

Expected: types, ui, web, api build and API smoke checks PASS. If Docker or an external dependency blocks a check, record the exact failure without changing protected infrastructure files.

- [ ] **Step 8: Commit and push Task 2**

```bash
git add apps/web/src/app/manager/ticket/dash/00/TicketDetailDialog.tsx apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts apps/web/src/app/manager/globals.css
git commit -m "feat(manager): 민원 첨부 이미지 미리보기 추가"
git push origin kms-complain
```

- [ ] **Step 9: Verify branch synchronization**

Run:

```bash
git status --short --branch
git rev-list --left-right --count origin/kms-complain...kms-complain
```

Expected: only pre-existing user-owned untracked files remain and branch counts are `0 0`.
