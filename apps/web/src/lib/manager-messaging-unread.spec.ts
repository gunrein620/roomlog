import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { Thread } from "@roomlog/types";
import { totalManagerUnreadGeneralMessages } from "./manager-messaging-unread";

const webRoot = path.resolve(__dirname, "..");
const detailPage = readFileSync(
  path.join(webRoot, "app/manager/messaging/04/page.tsx"),
  "utf8",
);
const readReceipt = readFileSync(
  path.join(webRoot, "app/manager/messaging/04/ManagerThreadReadReceipt.tsx"),
  "utf8",
);
const unreadSource = readFileSync(
  path.join(webRoot, "lib/manager-messaging-unread.ts"),
  "utf8",
);

test("sums only manager unread general inquiry messages", () => {
  const threads = [
    { context: "general", managerUnreadCount: 2 },
    { context: "general", managerUnreadCount: 1 },
    { context: "defect", managerUnreadCount: 9 },
  ] as unknown as Thread[];

  assert.equal(totalManagerUnreadGeneralMessages(threads), 3);
});

test("marks a thread read from a mounted client receipt instead of server rendering", () => {
  assert.match(detailPage, /getManagerThread\(id\)/);
  assert.match(
    detailPage,
    /<ManagerThreadReadReceipt[\s\S]*threadId=\{thread\.id\}[\s\S]*\/>/,
  );
  assert.doesNotMatch(detailPage, /markManagerThreadRead/);
  assert.match(readReceipt, /useEffect\(\(\) =>/);
  assert.match(readReceipt, /method: "POST"/);
  assert.match(readReceipt, /\[threadId, ticketId\]/);
  assert.match(readReceipt, /window\.dispatchEvent/);
  assert.match(unreadSource, /window\.addEventListener\(MANAGER_MESSAGING_READ_EVENT/);
  assert.match(unreadSource, /window\.removeEventListener\(MANAGER_MESSAGING_READ_EVENT/);
});

test("marks a linked ticket read independently when its conversation opens", () => {
  assert.match(
    detailPage,
    /ticketId=\{thread\.context === "defect" \? thread\.contextRef : undefined\}/,
  );
  assert.match(readReceipt, /ticketId\?: string/);
  assert.match(
    readReceipt,
    /if \(ticketId\)[\s\S]*markManagerTicketRead\(ticketId\)/,
  );
  assert.match(readReceipt, /\[threadId, ticketId\]/);
});

test("refreshes the manager unread badge from realtime messaging activity", () => {
  assert.match(unreadSource, /getRealtimeSocket/);
  assert.match(unreadSource, /socket\.on\("roomlog:activity", onActivity\)/);
  assert.match(unreadSource, /socket\.off\("roomlog:activity", onActivity\)/);
  assert.match(unreadSource, /kind === "messaging"/);
});
