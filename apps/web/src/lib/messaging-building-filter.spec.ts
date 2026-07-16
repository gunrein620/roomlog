import assert from "node:assert/strict";
import test from "node:test";
import type { ManagerMessagingRecipient, Thread } from "@roomlog/types";
import {
  UNASSIGNED_BUILDING_FILTER,
  filterThreadsByBuilding,
  getBuildingOptions,
  hasUnassignedBuilding,
  resolveBuildingFilter,
} from "./messaging-building-filter";

function thread(id: string, buildingName?: string): Thread {
  return {
    id,
    buildingName,
    unitId: "101",
    tenantId: `tenant-${id}`,
    context: "general",
    lastMessage: "문의",
    unreadCount: 0,
    managerUnreadCount: 0,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-07-11T12:00:00+09:00",
  };
}

const threads = [
  thread("a", " 테스트 건물1 "),
  thread("b", "테스트 건물2"),
  thread("duplicate", "테스트 건물1"),
  thread("c"),
];

test("builds unique normalized building options and detects legacy threads", () => {
  assert.deepEqual(getBuildingOptions(threads), ["테스트 건물1", "테스트 건물2"]);
  assert.equal(hasUnassignedBuilding(threads), true);
});

test("includes contract recipient buildings without existing threads", () => {
  const recipients: ManagerMessagingRecipient[] = [
    {
      roomId: "room-contract-101",
      buildingName: "계약 빌딩",
      unitId: "101",
      tenantId: "tenant-contract",
      tenantName: "김세입",
    },
  ];

  assert.deepEqual(getBuildingOptions([], recipients), ["계약 빌딩"]);
});

test("accepts only available URL building filters", () => {
  const options = getBuildingOptions(threads);

  assert.equal(resolveBuildingFilter("테스트 건물1", options, true), "테스트 건물1");
  assert.equal(resolveBuildingFilter(UNASSIGNED_BUILDING_FILTER, options, true), UNASSIGNED_BUILDING_FILTER);
  assert.equal(resolveBuildingFilter("없는 건물", options, true), "");
  assert.equal(resolveBuildingFilter(undefined, options, true), "");
});

test("filters threads by a selected building or the unassigned option", () => {
  assert.deepEqual(
    filterThreadsByBuilding(threads, "테스트 건물1").map(({ id }) => id),
    ["a", "duplicate"],
  );
  assert.deepEqual(
    filterThreadsByBuilding(threads, UNASSIGNED_BUILDING_FILTER).map(({ id }) => id),
    ["c"],
  );
  assert.equal(filterThreadsByBuilding(threads, "").length, threads.length);
});
