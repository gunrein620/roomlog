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
  assert.match(detailPage, /<ManagerThreadReadReceipt threadId=\{thread\.id\} \/>/);
  assert.doesNotMatch(detailPage, /markManagerThreadRead/);
  assert.match(readReceipt, /useEffect\(\(\) =>/);
  assert.match(readReceipt, /method: "POST"/);
  assert.match(readReceipt, /\[threadId\]/);
  assert.match(readReceipt, /window\.dispatchEvent/);
  assert.match(unreadSource, /window\.addEventListener\(MANAGER_MESSAGING_READ_EVENT/);
  assert.match(unreadSource, /window\.removeEventListener\(MANAGER_MESSAGING_READ_EVENT/);
});
