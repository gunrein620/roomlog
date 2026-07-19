import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const managerSource = readFileSync(
  join(root, "src/app/manager/ticket/dash/00/TicketChatPanel.tsx"),
  "utf8",
);
const tenantSource = readFileSync(
  join(root, "src/app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const managerCss = readFileSync(join(root, "src/app/manager/globals.css"), "utf8");
const tenantCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("관리자 채팅은 최대 5장의 사진을 업로드해 메시지 URL로 보낸다", () => {
  assert.match(managerSource, /accept="image\/\*"/);
  assert.match(managerSource, /multiple/);
  assert.match(managerSource, /validateTicketChatImages/);
  assert.match(managerSource, /uploadTicketChatImages/);
  assert.match(managerSource, /JSON\.stringify\(\{ messageText, attachmentUrls \}\)/);
  assert.match(managerSource, /selectedImages\.length > 0/);
  assert.match(managerSource, /URL\.revokeObjectURL/);
  assert.match(managerCss, /manager-ticket-panel__selected-attachments/);
});

test("세입자 채팅은 사진-only 메시지를 유지하고 첨부 사진을 표시한다", () => {
  assert.match(tenantSource, /complaintChatImages/);
  assert.match(tenantSource, /accept="image\/\*"/);
  assert.match(tenantSource, /uploadTicketChatImages/);
  assert.match(tenantSource, /JSON\.stringify\(\{ messageText, attachmentUrls \}\)/);
  assert.match(
    tenantSource,
    /message\.messageText[\s\S]*message\.attachmentUrls\?\.length/,
  );
  assert.match(tenantSource, /resolveTicketChatAttachmentUrl/);
  assert.match(tenantSource, /URL\.revokeObjectURL/);
  assert.match(tenantCss, /tenant-defect-chat-attachments/);
});

test("양쪽 보내기 버튼은 글 또는 선택 사진이 있을 때 활성화된다", () => {
  assert.match(managerSource, /draft\.trim\(\) \|\| selectedImages\.length > 0/);
  assert.match(
    tenantSource,
    /complaintChatDraft\.trim\(\)\.length > 0 \|\| complaintChatImages\.length > 0/,
  );
});
