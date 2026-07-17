import assert from "node:assert/strict";
import test from "node:test";
import type { Thread } from "@roomlog/types";
import {
  managerThreadConfirmationLabel,
  managerThreadNeedsReply,
  sortManagerThreads,
} from "./manager-messaging-thread-status";

function thread(
  id: string,
  options: {
    managerUnreadCount?: number;
    lastMessageSender?: Thread["lastMessageSender"];
    pendingRequest?: boolean;
    updatedAt?: string;
  } = {},
): Thread {
  return {
    id,
    managerUnreadCount: options.managerUnreadCount ?? 0,
    lastMessageSender: options.lastMessageSender,
    pendingRequest: options.pendingRequest ?? false,
    updatedAt: options.updatedAt ?? "2026-07-18T00:00:00.000Z",
  } as Thread;
}

test("classifies manager messages as unconfirmed or confirmed", () => {
  assert.equal(
    managerThreadConfirmationLabel(thread("unconfirmed", { managerUnreadCount: 2 })),
    "미확인",
  );
  assert.equal(
    managerThreadConfirmationLabel(thread("confirmed", { managerUnreadCount: 0 })),
    "확인",
  );
});

test("keeps reply need independent from confirmation", () => {
  assert.equal(
    managerThreadNeedsReply(thread("tenant-last", { lastMessageSender: "tenant" })),
    true,
  );
  assert.equal(
    managerThreadNeedsReply(thread("pending", { pendingRequest: true })),
    true,
  );
  assert.equal(
    managerThreadNeedsReply(thread("manager-last", { lastMessageSender: "manager" })),
    false,
  );
});

test("sorts unconfirmed before reply-needed and then recent threads", () => {
  const rows = [
    thread("recent", { updatedAt: "2026-07-18T03:00:00.000Z" }),
    thread("reply", {
      lastMessageSender: "tenant",
      updatedAt: "2026-07-18T01:00:00.000Z",
    }),
    thread("unconfirmed-old", {
      managerUnreadCount: 1,
      updatedAt: "2026-07-18T00:00:00.000Z",
    }),
    thread("unconfirmed-new", {
      managerUnreadCount: 2,
      updatedAt: "2026-07-18T02:00:00.000Z",
    }),
  ];

  assert.deepEqual(
    sortManagerThreads(rows).map((row) => row.id),
    ["unconfirmed-new", "unconfirmed-old", "reply", "recent"],
  );
  assert.deepEqual(rows.map((row) => row.id), [
    "recent",
    "reply",
    "unconfirmed-old",
    "unconfirmed-new",
  ]);
});
