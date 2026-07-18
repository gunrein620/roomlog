# Tenant Complaint Chat Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the complaint title, status/urgency summary, and ticket chat as the only content in the tenant complaint history detail modal.

**Architecture:** Preserve the existing complaint detail fetch and shared ticket message API, but remove all detail-only presentation and direct-action branches from `TenantMyPage`. Keep creation fields and server data untouched. Lock the boundary with a source-contract test that extracts only the history detail JSX so the unchanged new-request form can retain its fields.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, CSS token variables.

## Global Constraints

- The new complaint request modal remains unchanged.
- The history detail modal retains the submitted title, close control, current status, urgency, message history, and composer only.
- Completed or cancelled tickets keep read-only message history.
- Complaint source data, APIs, shared types, manager screens, and vendor screens remain unchanged.
- Styles use existing `var(--...)` tokens; no new raw hex values.

---

### Task 1: Lock the chat-only detail contract

**Files:**
- Modify: `apps/web/src/lib/defect-responsibility-urgency.spec.ts`

**Interfaces:**
- Consumes: the `selectedRepairRequest` and `isRequestSheetOpen` JSX boundaries in `TenantMyPage.tsx`.
- Produces: a regression contract for the detail modal that permits the unchanged creation form outside that boundary.

- [x] **Step 1: Write the failing test**

Extract `historyDetailSource` from the detail modal boundary. Assert that it contains `selectedRepairRequest.title`, `detailStatusLabel`, `긴급도`, `진행 메시지`, and `진행 메시지 입력`. Assert that it excludes `요청 유형`, `발생일시`, `본문 내용`, `발생 위치`, `첨부 이미지`, `TenantVendorWorkflowPanel`, `TenantVendorConnectionCard`, `책임 판단 이의제기`, `AI 추정 · 확정 아님`, and `수리 완료 확인`. Keep the creation test assertions for urgency and `/api/tenant/complaints/` against the full source.

- [x] **Step 2: Run the focused test and verify RED**

Run from `apps/web`: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/defect-responsibility-urgency.spec.ts`

Expected: FAIL because the current history detail JSX still contains the removed fields and actions.

- [x] **Step 3: Do not modify production code in this task**

The failing contract is the deliverable for the red phase.

### Task 2: Reduce the history detail modal to summary and chat

**Files:**
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `selectedRepairRequest.title`, `detailTicket`, `detailStatusLabel`, `detailMessages`, `isTicketClosed`, and `handleSendComplaintMessage`.
- Produces: a detail dialog containing only the header, status/urgency card, error notice, message history, and composer.

- [x] **Step 1: Remove detail-only React state and derived values**

Delete appeal, completion-confirmation, and manager-chat loading state. Delete derived request date/body/photos, responsibility decision, direct handling, open appeal, completion report, and self-repair eligibility values. Preserve `detailTicket`, `detailStatusLabel`, `detailMessages`, and `isTicketClosed`.

- [x] **Step 2: Remove detail-only handlers**

Delete `handleSubmitAppeal`, `handleConfirmCompletion`, and `handleOpenManagerChat`. Remove their reset calls from open/close functions. Keep `refreshComplaintDetail` because realtime refresh and message sending use it.

- [x] **Step 3: Replace the detail body with the approved content**

Keep the title header and close button. Render the status card with only `<strong>{detailStatusLabel}</strong>` and the optional `긴급도 {detailTicket.priority}` chip. Keep the existing message list and composer. Remove metadata, body, location, images, vendor workflow, vendor connection, appeal, completion button, and bottom `닫기` action; the header close control remains.

- [x] **Step 4: Remove styles used only by deleted detail blocks**

Remove detail-only readonly body sizing, decision, confirmation, and appeal rules. Keep request-creation rules and the status/chat rules used by the reduced detail modal.

- [x] **Step 5: Run the focused test and verify GREEN**

Run from `apps/web`: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/defect-responsibility-urgency.spec.ts`

Expected: PASS with zero failures.

### Task 3: Verify the web surface and repository

**Files:**
- Verify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Verify: `apps/web/src/app/globals.css`
- Verify: `apps/web/src/lib/defect-responsibility-urgency.spec.ts`

**Interfaces:**
- Consumes: the completed implementation.
- Produces: fresh test and build evidence.

- [ ] **Step 1: Run the complete web test suite** — 실행됨: 기존 관리자 계약 계약 테스트 2건 실패로 중단.

Run: `pnpm test:web`

Expected: PASS with zero test failures.

- [x] **Step 2: Run the repository verification script**

Run: `bash scripts/verify.sh`

Expected: exit code 0 for types, UI, web, API, and API smoke verification.

- [x] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors and only the planned implementation/test/plan files changed after the already committed design document.
