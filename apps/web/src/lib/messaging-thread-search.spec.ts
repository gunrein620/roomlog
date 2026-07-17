import assert from "node:assert/strict";
import test from "node:test";
import type { Thread } from "@roomlog/types";
import { filterThreadsBySearch } from "./messaging-thread-search";

const threads: Thread[] = [
  {
    id: "thread-1",
    buildingName: "해오름 빌딩",
    unitId: "101",
    tenantId: "tenant-1",
    context: "defect",
    contextLabel: "보일러 수리",
    lastMessage: "온수가 나오지 않습니다.",
    unreadCount: 1,
    managerUnreadCount: 1,
    pendingRequest: false,
    archivedNotice: false,
    updatedAt: "2026-07-16T10:00:00.000Z",
  },
  {
    id: "thread-2",
    buildingName: "푸른마을",
    unitId: "202호",
    tenantId: "tenant-2",
    context: "payment",
    contextLabel: "관리비 문의",
    lastMessage: "납부 내역을 확인해 주세요.",
    unreadCount: 0,
    managerUnreadCount: 0,
    pendingRequest: false,
    archivedNotice: false,
    updatedAt: "2026-07-15T10:00:00.000Z",
  },
];

test("returns every ticket for an empty search", () => {
  assert.deepEqual(filterThreadsBySearch(threads, "  "), threads);
});

test("searches the conversation title and latest message", () => {
  assert.deepEqual(filterThreadsBySearch(threads, " 보일러 "), [threads[0]]);
  assert.deepEqual(filterThreadsBySearch(threads, "납부 내역"), [threads[1]]);
});

test("does not treat the building or unit as title and content", () => {
  assert.deepEqual(filterThreadsBySearch(threads, "해오름"), []);
  assert.deepEqual(filterThreadsBySearch(threads, "202호"), []);
});
