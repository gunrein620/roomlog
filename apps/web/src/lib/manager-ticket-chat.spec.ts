import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);
const actionsSource = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/01/actions.ts"),
  "utf8",
);
const chatPath = join(
  process.cwd(),
  "src/app/manager/ticket/dash/01/ManagerTicketChat.tsx",
);
const chatSource = existsSync(chatPath) ? readFileSync(chatPath, "utf8") : "";
const uiSource = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);
const apiSource = readFileSync(
  join(process.cwd(), "src/lib/ticket-manager-api.ts"),
  "utf8",
);
const typeSource = readFileSync(
  join(process.cwd(), "../../packages/types/src/ticket.ts"),
  "utf8",
);

test("manager detail maps the shared ticket thread contract", () => {
  assert.match(typeSource, /export interface TicketThreadMessage/);
  assert.match(typeSource, /export interface TicketVendorDecline/);
  assert.match(apiSource, /messages: ticket\.messages \?\? \[\]/);
  assert.match(apiSource, /vendorDecline: ticket\.vendorDecline/);
});

test("manager detail renders a labelled, bottom-scrolling chat thread and composer", () => {
  assert.match(pageSource, /<ManagerTicketChat/);
  assert.match(pageSource, /messages=\{detail\.messages\}/);
  assert.match(pageSource, /action=\{sendTicketChatAction\}/);
  assert.match(chatSource, /진행 메시지/);
  assert.match(chatSource, /managerTicketMessageSenderLabel\(message\.senderRole\)/);
  assert.match(chatSource, /maxHeight:/);
  assert.match(chatSource, /overflowY: "auto"/);
  assert.match(chatSource, /scrollHeight/);
  assert.match(chatSource, /name="messageText"/);
  assert.match(chatSource, />보내기</);
  assert.match(uiSource, /TENANT[\s\S]*세입자/);
  assert.match(uiSource, /LANDLORD[\s\S]*나/);
  assert.match(uiSource, /VENDOR[\s\S]*업체/);
  assert.match(uiSource, /시스템·AI/);
  assert.match(actionsSource, /export async function sendTicketChatAction/);
  assert.match(actionsSource, /sendManagerTicketReply\(ticketId/);
});

test("manager detail shows vendor decline reason and reassignment path", () => {
  assert.match(pageSource, /업체가 배정을 거절했습니다/);
  assert.match(pageSource, /detail\.vendorDecline\.reason/);
  assert.match(pageSource, /ticketDashHref\("04", ticket\.id\)/);
});
