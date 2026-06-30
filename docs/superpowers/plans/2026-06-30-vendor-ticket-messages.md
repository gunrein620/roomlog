# Vendor Ticket Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let assigned vendors leave ticket-scoped work messages with attachments, and make vendor completion reports use real uploaded photos instead of a demo URL.

**Architecture:** Keep the existing single NestJS `RoomlogService` store model. Add a vendor-scoped message method that resolves the repair, verifies vendor ownership through `findVendorRepair`, writes a `TicketMessage` with role `VENDOR`, and returns the updated repair/ticket detail. Wire one controller route and update the vendor Next.js app to upload completion photos through `/api/attachments`.

**Tech Stack:** NestJS service/controller, Node test runner with `ts-node/register`, Next.js App Router React client UI, existing multipart upload endpoint.

---

### Task 1: Vendor Ticket Message API

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`

- [ ] **Step 1: Write the failing test**

Add a service test that creates a complaint, assigns a vendor, calls the wished-for `addVendorRepairMessage` API, and proves the message appears in both manager and vendor views:

```ts
const vendorMessage = service.addVendorRepairMessage("vendor-demo", repair.id, {
  messageText: "현장 도착 전 누수 차단 밸브 위치를 확인해주세요.",
  attachmentUrls: ["/api/files/vendor-before-visit.jpg"]
});

assert.equal(vendorMessage.message.senderRole, "VENDOR");
assert.equal(
  service
    .getTicketDetailForManager("landlord-demo", ticket.id)
    .messages.some((message) =>
      message.senderRole === "VENDOR" &&
      message.attachmentUrls.includes("/api/files/vendor-before-visit.jpg")
    ),
  true
);
assert.throws(
  () => service.addVendorRepairMessage("other-vendor-user", repair.id, { messageText: "권한 없음" }),
  /수리 요청/
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
PATH="/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm test:api
```

Expected: FAIL because `addVendorRepairMessage` does not exist.

- [ ] **Step 3: Implement the minimal API**

Add `AddVendorRepairMessageInput` to `roomlog.types.ts`, import it into service/controller, add `RoomlogService.addVendorRepairMessage`, and expose:

```ts
@Post("vendor/repairs/:repairId/messages")
addVendorRepairMessage(...)
```

The method must trim text, require text or attachments, use `findVendorRepair` for ownership, write a `VENDOR` ticket message, persist, and return `{ message, repair, ticket }`.

- [ ] **Step 4: Run test to verify it passes**

Run the same `pnpm test:api`; expected: 24+ tests pass.

### Task 2: Real Vendor Completion Photo Upload

**Files:**
- Modify: `apps/vendor/src/app/page.tsx`
- Modify: `apps/vendor/src/app/globals.css`

- [ ] **Step 1: Add a UI-facing regression check**

Use the existing production build as the first check after editing because the vendor app currently has no frontend test harness:

```bash
PATH="/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm build:vendor
```

Expected before implementation is not applicable because this project has no vendor test runner. Keep API behavior covered by Task 1 and verify the UI through browser smoke.

- [ ] **Step 2: Implement upload-backed completion**

Replace the hard-coded `completionPhotoUrls: ["/uploads/demo-completion.jpg"]` with selected file upload through `/api/attachments` using category `COMPLETION_PHOTO`. Reuse uploaded URLs for `reportCompletion`, and show selected/uploaded state in the vendor action panel.

- [ ] **Step 3: Verify**

Run:

```bash
PATH="/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm build:vendor
PATH="/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm build:api
docker compose up -d --build api vendor
```

Then HTTP-smoke vendor message creation and completion photo reporting through the running stack.
