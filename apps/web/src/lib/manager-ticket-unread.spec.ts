import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { totalManagerUnreadTickets } from "./manager-ticket-unread";

const webRoot = path.resolve(__dirname, "..");
const unreadSource = readFileSync(
  path.join(webRoot, "lib/manager-ticket-unread.ts"),
  "utf8",
);

test("counts only manager-unread tickets", () => {
  assert.equal(
    totalManagerUnreadTickets([
      { isManagerUnread: true },
      { isManagerUnread: false },
      { isManagerUnread: true },
    ]),
    2,
  );
});

test("refreshes ticket unread count from realtime and successful modal reads", () => {
  assert.match(unreadSource, /getRealtimeSocket/);
  assert.match(unreadSource, /socket\.on\("roomlog:activity", onActivity\)/);
  assert.match(unreadSource, /socket\.off\("roomlog:activity", onActivity\)/);
  assert.match(unreadSource, /kind === "ticket"/);
  assert.match(unreadSource, /MANAGER_TICKET_READ_EVENT/);
  assert.match(unreadSource, /window\.addEventListener\(MANAGER_TICKET_READ_EVENT/);
  assert.match(unreadSource, /window\.removeEventListener\(MANAGER_TICKET_READ_EVENT/);
});

test("marks the selected ticket read through the manager BFF", () => {
  assert.match(
    unreadSource,
    /fetch\(`\/api\/manager\/tickets\/\$\{encodeURIComponent\(ticketId\)\}\/read`/,
  );
  assert.match(unreadSource, /method: "POST"/);
  assert.match(unreadSource, /window\.dispatchEvent\(new Event\(MANAGER_TICKET_READ_EVENT\)\)/);
});
