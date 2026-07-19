# Ticket Chat Photo and Vendor Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable photo-only and text-plus-photo messaging in the shared tenant/manager defect chat, publish vendor assignment contact notices into that chat, and replace the row ellipsis menu with a direct detail button.

**Architecture:** Reuse the authenticated attachment storage endpoint and persist only returned URLs in `TicketMessage.attachmentUrls`. Keep vendor assignment and its tenant notice atomic in the Prisma transaction, then synchronize the committed message into the existing in-memory read model and websocket event. Replace the single-item portal menu with a plain Next.js link.

**Tech Stack:** Next.js 16 App Router, React 19, NestJS 11, Prisma 7/PostgreSQL, Socket.IO, TypeScript, Node test runner.

## Global Constraints

- One message accepts zero text only when at least one photo is attached.
- One message accepts at most 5 image files, each no larger than 10MB.
- Gara quote and credit payment behavior must not change.
- Existing auth cookies, room/ticket authorization, and `roomlog:ticket-message` transport remain authoritative.
- Use shared CSS tokens only; do not add raw hex colors.
- Work only on `codex/ticket-chat-photo-vendor-notice`; do not push implementation commits without a separate user request.

---

### Task 1: Shared authenticated chat-photo upload client

**Files:**
- Create: `apps/web/src/app/api/attachments/route.ts`
- Create: `apps/web/src/lib/ticket-chat-attachments.ts`
- Create: `apps/web/src/lib/ticket-chat-attachments.spec.ts`

**Interfaces:**
- Consumes: authenticated browser request and upstream `POST /attachments` response `{ fileUrl: string }`.
- Produces: `MAX_TICKET_CHAT_IMAGES`, `MAX_TICKET_CHAT_IMAGE_BYTES`, `validateTicketChatImages(files, existingCount)`, `uploadTicketChatImages(files, fetcher?)`, and `resolveTicketChatAttachmentUrl(url, publicApiBase?)`.

- [ ] **Step 1: Write the failing validation and upload tests**

```ts
test("accepts up to five images and rejects non-images or files over 10MB", () => {
  assert.equal(validateTicketChatImages([
    { name: "one.jpg", type: "image/jpeg", size: 1024 },
  ], 4), null);
  assert.match(validateTicketChatImages([
    { name: "six.jpg", type: "image/jpeg", size: 1024 },
  ], 5) ?? "", /최대 5장/);
  assert.match(validateTicketChatImages([
    { name: "memo.pdf", type: "application/pdf", size: 1024 },
  ], 0) ?? "", /이미지 파일만/);
  assert.match(validateTicketChatImages([
    { name: "large.jpg", type: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
  ], 0) ?? "", /10MB 이하/);
});

test("uploads each image and returns file URLs in selection order", async () => {
  const firstFile = new File(["first"], "first.jpg", { type: "image/jpeg" });
  const secondFile = new File(["second"], "second.png", { type: "image/png" });
  const calls: string[] = [];
  const urls = await uploadTicketChatImages([firstFile, secondFile], async (_url, init) => {
    calls.push((init?.body as FormData).get("file") instanceof File ? "file" : "missing");
    return new Response(JSON.stringify({ fileUrl: `/uploads/${calls.length}.jpg` }));
  });
  assert.deepEqual(calls, ["file", "file"]);
  assert.deepEqual(urls, ["/uploads/1.jpg", "/uploads/2.jpg"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd apps/web && node --test -r ts-node/register src/lib/ticket-chat-attachments.spec.ts`

Expected: FAIL because `ticket-chat-attachments.ts` does not exist.

- [ ] **Step 3: Implement the neutral BFF and upload helper**

```ts
export const MAX_TICKET_CHAT_IMAGES = 5;
export const MAX_TICKET_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateTicketChatImages(
  files: readonly Pick<File, "name" | "type" | "size">[],
  existingCount = 0,
): string | null {
  if (existingCount + files.length > MAX_TICKET_CHAT_IMAGES) return "사진은 한 번에 최대 5장까지 보낼 수 있습니다.";
  if (files.some((file) => !file.type.startsWith("image/"))) return "이미지 파일만 첨부할 수 있습니다.";
  if (files.some((file) => file.size > MAX_TICKET_CHAT_IMAGE_BYTES)) return "이미지는 한 장당 10MB 이하만 첨부할 수 있습니다.";
  return null;
}

export async function uploadTicketChatImages(
  files: readonly File[],
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    form.append("category", "ADDITIONAL_PHOTO");
    const response = await fetcher("/api/attachments", { method: "POST", body: form });
    const data = await response.json().catch(() => undefined) as { fileUrl?: string; message?: string } | undefined;
    if (!response.ok || !data?.fileUrl) throw new Error(data?.message || "이미지 업로드에 실패했습니다.");
    urls.push(data.fileUrl);
  }
  return urls;
}

export function resolveTicketChatAttachmentUrl(
  url: string,
  publicApiBase = process.env.NEXT_PUBLIC_API_URL ?? "",
): string {
  const normalizedUrl = url.trim();
  const normalizedBase = publicApiBase.trim().replace(/\/+$/, "");
  if (!normalizedUrl.startsWith("/api/") || !/^https?:\/\//.test(normalizedBase)) return normalizedUrl;
  return normalizedBase.endsWith("/api")
    ? `${normalizedBase}${normalizedUrl.slice(4)}`
    : `${normalizedBase}${normalizedUrl}`;
}
```

Implement `apps/web/src/app/api/attachments/route.ts` with the same cookie forwarding and upstream error normalization as `apps/web/src/app/api/tenant/uploads/route.ts`, but keep the neutral browser path `/api/attachments`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd apps/web && node --test -r ts-node/register src/lib/ticket-chat-attachments.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/app/api/attachments/route.ts apps/web/src/lib/ticket-chat-attachments.ts apps/web/src/lib/ticket-chat-attachments.spec.ts
git commit -m "feat: add shared ticket chat photo uploads"
```

---

### Task 2: Manager reply API accepts photo messages

**Files:**
- Modify: `packages/types/src/ticket.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller-realtime.spec.ts`

**Interfaces:**
- Consumes: `ManagerTicketReplyInput { messageText?: string; attachmentUrls?: string[] }`.
- Produces: a LANDLORD `TicketThreadMessage` with preserved `attachmentUrls` and the existing realtime payload.

- [ ] **Step 1: Add failing manager photo-message service tests**

```ts
it("lets a manager send a photo-only ticket reply", () => {
  const result = service.sendManagerTicketReply(manager.id, ticket.id, {
    attachmentUrls: ["/uploads/manager-leak.jpg"],
  });
  assert.equal(result.message.messageText, "사진을 첨부했습니다.");
  assert.deepEqual(result.message.attachmentUrls, ["/uploads/manager-leak.jpg"]);
});

it("rejects a manager reply with no text and no attachments", () => {
  assert.throws(
    () => service.sendManagerTicketReply(manager.id, ticket.id, {}),
    /답변 내용 또는 사진/,
  );
});
```

Extend the existing realtime controller test so the broadcast assertion includes `attachmentUrls: ["/uploads/manager-leak.jpg"]`.

- [ ] **Step 2: Run focused API tests and verify RED**

Run: `cd apps/api && node --test -r ts-node/register src/roomlog/roomlog.service.spec.ts src/roomlog/roomlog.controller-realtime.spec.ts`

Expected: FAIL because manager attachments are not accepted or persisted.

- [ ] **Step 3: Extend the shared and API-local input contracts**

```ts
export interface ManagerTicketReplyInput {
  action?: ManagerReplyAction;
  messageText?: string;
  attachmentUrls?: string[];
}
```

Apply the same property to the API-local type in `roomlog.types.ts`.

- [ ] **Step 4: Persist photo-only and mixed manager replies**

Normalize and deduplicate nonblank URLs. Reject only when both text and URLs are empty, then call:

```ts
const message = this.addMessageInternal(
  ticket.id,
  ticket.complaintId,
  managerId,
  "LANDLORD",
  messageText || "사진을 첨부했습니다.",
  attachmentUrls,
  this.activeRepairIdForTicket(ticket.id),
);
```

Preserve the existing ticket-state transition and `persistStore()` behavior.

- [ ] **Step 5: Run focused API tests and typecheck**

Run: `pnpm --filter @roomlog/types typecheck && cd apps/api && node --test -r ts-node/register src/roomlog/roomlog.service.spec.ts src/roomlog/roomlog.controller-realtime.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/types/src/ticket.ts apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.service.spec.ts apps/api/src/roomlog/roomlog.controller-realtime.spec.ts
git commit -m "feat: accept photos in manager ticket replies"
```

---

### Task 3: Add photo composer and rendering to both chat surfaces

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/TicketChatPanel.tsx`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/ticket-chat-photo-ui.spec.ts`

**Interfaces:**
- Consumes: Task 1 `validateTicketChatImages` and `uploadTicketChatImages`; Task 2 manager reply contract.
- Produces: up to five removable local previews and text/photo message requests from both roles.

- [ ] **Step 1: Add failing source-contract tests for both chat surfaces**

```ts
test("manager chat uploads selected photos and sends attachment URLs", () => {
  assert.match(managerSource, /accept="image\/\*"/);
  assert.match(managerSource, /multiple/);
  assert.match(managerSource, /uploadTicketChatImages/);
  assert.match(managerSource, /JSON\.stringify\(\{ messageText, attachmentUrls \}\)/);
  assert.match(managerSource, /URL\.revokeObjectURL/);
});

test("tenant chat renders and sends ticket message photos", () => {
  assert.match(tenantSource, /message\.attachmentUrls/);
  assert.match(tenantSource, /uploadTicketChatImages/);
  assert.match(tenantSource, /attachmentUrls/);
  assert.match(tenantSource, /complaintChatImages/);
});
```

Also assert that send buttons are enabled by `draft.trim() || selectedImages.length > 0` and that the tenant detail filter retains attachment-only messages.

- [ ] **Step 2: Run the focused UI test and verify RED**

Run: `cd apps/web && node --test -r ts-node/register src/lib/ticket-chat-photo-ui.spec.ts`

Expected: FAIL because neither composer uploads photos and tenant bubbles do not render attachments.

- [ ] **Step 3: Implement manager photo selection and sending**

Add `selectedImages: Array<{ id: string; file: File; previewUrl: string }>` and a hidden `multiple` image input. Validate selection before creating object URLs. In `sendMessage`, upload first and send:

```ts
const attachmentUrls = await uploadTicketChatImages(selectedImages.map((image) => image.file));
body: JSON.stringify({ messageText, attachmentUrls });
```

Allow photo-only send, keep draft/selections on failure, clear both on success, and revoke previews on remove, ticket change, close, and unmount.

- [ ] **Step 4: Implement tenant photo selection, sending, and rendering**

Add an independent `complaintChatImages` state so new-request images cannot leak into chat. Send:

```ts
const attachmentUrls = await uploadTicketChatImages(complaintChatImages.map((image) => image.file));
body: JSON.stringify({ messageText, attachmentUrls });
```

Change `detailMessages` to retain messages with nonblank text or at least one attachment. Render each `message.attachmentUrls` as linked thumbnails using Task 1 `resolveTicketChatAttachmentUrl`; keep a per-message failed URL set and replace a failed image with a filename link. Clear and revoke only after a successful message response.

- [ ] **Step 5: Add token-based preview/composer styles**

Add compact attachment grids, remove buttons, hidden file inputs, and focus-visible states under the existing manager panel and tenant defect-chat selectors. Use only `var(--...)` color, spacing, radius, font, and shadow tokens.

- [ ] **Step 6: Run focused and adjacent web tests**

Run: `cd apps/web && node --test -r ts-node/register src/lib/ticket-chat-attachments.spec.ts src/lib/ticket-chat-photo-ui.spec.ts src/app/manager/ticket/dash/00/ticket-chat-panel.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/web/src/app/manager/ticket/dash/00/TicketChatPanel.tsx apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/manager/globals.css apps/web/src/app/globals.css apps/web/src/lib/ticket-chat-photo-ui.spec.ts
git commit -m "feat: send photos in defect chat"
```

---

### Task 4: Publish vendor assignment contact notice atomically

**Files:**
- Modify: `apps/api/src/roomlog/vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts`
- Modify: `apps/api/src/roomlog/prisma-direct-handling.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller-realtime.spec.ts`

**Interfaces:**
- Produces: `VendorAssignmentCommit { job: VendorJobDetail; notice?: VendorAssignmentNoticeRecord }`.
- `VendorAssignmentNoticeRecord` contains `id`, `ticketId`, `complaintId`, `repairId`, `senderUserId`, `senderRole: "LANDLORD"`, `messageText`, `attachmentUrls: []`, and `createdAt`.
- The HTTP endpoint continues returning only `VendorJobDetail` to preserve the web client contract.

- [ ] **Step 1: Add failing repository and domain tests**

For a new assignment, assert the committed notice text includes all three required pieces:

```ts
assert.match(commit.notice?.messageText ?? "", /빠른누수 설비/);
assert.match(commit.notice?.messageText ?? "", /010-1234-5678/);
assert.match(commit.notice?.messageText ?? "", /전화하여 방문 일정을 상의/);
```

Assert the `TicketMessage` row is LANDLORD-scoped to the new repair, reassignment names the new vendor, and a same-vendor idempotent retry returns `notice: undefined` with no additional message row. Add a domain assertion that `ingestVendorRepairMessage` receives the notice.

- [ ] **Step 2: Run focused workflow tests and verify RED**

Run: `cd apps/api && node --test -r ts-node/register src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts src/roomlog/prisma-direct-handling.spec.ts`

Expected: FAIL because assignment currently returns only a job and creates no ticket message.

- [ ] **Step 3: Add the internal assignment commit contracts**

```ts
export interface VendorAssignmentNoticeRecord {
  id: string;
  ticketId: string;
  complaintId: string;
  repairId: string;
  senderUserId: string;
  senderRole: "LANDLORD";
  messageText: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface VendorAssignmentCommit {
  job: VendorJobDetail;
  notice?: VendorAssignmentNoticeRecord;
}
```

Change `VendorWorkflowRepository.assignVendor` and `RoomlogVendorWorkflowDomain.assignVendor` to return the commit. Generalize the store-sync hook to accept both existing vendor records and assignment notices.

- [ ] **Step 4: Create the notice in the Prisma assignment transaction**

After creating the repair and updating ticket/complaint, create one `TicketMessage` with:

```ts
const vendorName = candidate.businessName.trim() || "수리 업체";
const phone = candidate.phone.trim();
const messageText = phone
  ? `배정 업체: ${vendorName}. 연락처는 ${phone}입니다. 해당 업체에 전화하여 방문 일정을 상의해 주세요.`
  : `배정 업체: ${vendorName}. 해당 업체에 전화하여 방문 일정을 상의해 주세요.`;
```

Return `{ job, notice }`. Preserve the existing early return for `current.vendorId === command.vendorId` as `{ job, notice: undefined }`, which is the idempotency guard.

- [ ] **Step 5: Synchronize and broadcast the committed notice**

Have the domain call the generalized RoomlogService ingestion hook before returning. In the controller:

```ts
const commit = await this.requireVendorWorkflowDomain().assignVendor(user.id, ticketId, body);
if (commit.notice) {
  this.realtime.broadcast("roomlog:ticket-message", {
    ticketId,
    message: commit.notice,
  });
}
return commit.job;
```

The RoomlogService ingestion method must deduplicate by message id and preserve the sender role instead of forcing `VENDOR`.

- [ ] **Step 6: Run workflow and realtime tests**

Run: `cd apps/api && node --test -r ts-node/register src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts src/roomlog/prisma-direct-handling.spec.ts src/roomlog/roomlog.controller-realtime.spec.ts`

Expected: PASS. PostgreSQL-backed cases may report skip only when the documented test database is unavailable.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api/src/roomlog/vendor-workflow.repository.ts apps/api/src/roomlog/prisma-vendor-workflow.repository.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts apps/api/src/roomlog/prisma-direct-handling.spec.ts apps/api/src/roomlog/roomlog.controller-realtime.spec.ts
git commit -m "feat: notify tenants when vendors are assigned"
```

---

### Task 5: Replace the ellipsis action menu with a direct detail link

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/TicketDetailAction.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Modify: `apps/web/src/lib/manager-ticket-consolidation.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css`
- Delete: `apps/web/src/app/manager/ticket/dash/00/TicketActionMenu.tsx`
- Delete: `apps/web/src/app/manager/ticket/dash/00/ticket-action-menu-position.ts`
- Delete: `apps/web/src/app/manager/ticket/dash/00/ticket-action-menu-position.spec.ts`

**Interfaces:**
- Produces: `TicketDetailAction({ ticketId, ticketTitle })` rendering a direct link to `ticketDashHref("01", ticketId)`.

- [ ] **Step 1: Change the dashboard tests to require the direct detail action**

```ts
assert.match(dashboardSource, /<TicketDetailAction/);
assert.match(detailActionSource, /ticketDashHref\("01", ticketId\)/);
assert.match(detailActionSource, />상세</);
assert.doesNotMatch(dashboardSource, /TicketActionMenu/);
assert.doesNotMatch(detailActionSource, /EllipsisVertical|createPortal|aria-haspopup/);
assert.equal(existsSync(positionSourcePath), false);
```

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `cd apps/web && node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts src/lib/manager-ticket-consolidation.spec.ts`

Expected: FAIL because the ellipsis menu still exists.

- [ ] **Step 3: Implement the direct detail action and remove menu-only code**

```tsx
export function TicketDetailAction({ ticketId, ticketTitle }: Props) {
  return (
    <Link
      className="manager-defect-dashboard__detail-action"
      aria-label={`${ticketTitle} 상세 처리`}
      href={ticketDashHref("01", ticketId)}
    >
      상세
    </Link>
  );
}
```

Replace the component import/use, delete the portal/position files, remove menu CSS, and add a token-based button-style link with a visible focus state.

- [ ] **Step 4: Run dashboard tests and verify GREEN**

Run: `cd apps/web && node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts src/lib/manager-ticket-consolidation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web/src/app/manager/ticket/dash/00 apps/web/src/app/manager/globals.css apps/web/src/lib/manager-ticket-consolidation.spec.ts
git commit -m "refactor: link ticket rows directly to detail"
```

---

### Task 6: Integrated verification and branch handoff

**Files:**
- Modify only files required by failures caused by Tasks 1-5; do not fix unrelated baseline failures.

**Interfaces:**
- Consumes all previous task outputs.
- Produces a clean local feature branch with verified commits and no implementation push.

- [ ] **Step 1: Run focused web tests**

Run: `cd apps/web && node --test -r ts-node/register src/lib/ticket-chat-attachments.spec.ts src/lib/ticket-chat-photo-ui.spec.ts src/app/manager/ticket/dash/00/ticket-chat-panel.spec.ts src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts src/lib/manager-ticket-consolidation.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run focused API tests**

Run: `cd apps/api && node --test -r ts-node/register src/roomlog/services/roomlog-vendor-workflow.domain.spec.ts src/roomlog/prisma-direct-handling.spec.ts src/roomlog/roomlog.controller-realtime.spec.ts`

Expected: PASS, with only documented database-unavailable skips permitted.

- [ ] **Step 3: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types and UI typechecks, web/api builds, health/listings smoke, and unified login smoke pass. If an unrelated pre-existing failure remains, capture its exact command and output without changing unrelated files.

- [ ] **Step 4: Inspect scope and repository state**

Run: `git diff dev...HEAD --check && git diff dev...HEAD --stat && git status --short --branch`

Expected: only this feature's files differ, no unstaged changes, and the branch is ahead of its origin tracking branch because implementation commits were not pushed.

- [ ] **Step 5: Report the local commit list without pushing**

Run: `git log --oneline origin/codex/ticket-chat-photo-vendor-notice..HEAD`

Expected: design, plan, and implementation commits are listed; do not run `git push`.
