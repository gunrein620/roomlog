import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Announcement } from "@roomlog/types";
import {
  normalizeAnnouncementFilter,
  selectAnnouncements,
  tenantAnnouncementDetailHref,
  tenantAnnouncementListHref,
} from "./announcement-list-model";

const notice = (overrides: Partial<Announcement>): Announcement => ({
  id: "notice",
  category: "life",
  scope: "all",
  title: "옥상 정원 이용 안내",
  body: "이용 시간이 변경됩니다.",
  sender: "관리사무소",
  sentAt: "2026-07-10T09:00:00+09:00",
  confirmRequired: false,
  state: "read",
  ...overrides,
});

describe("tenant announcement list model", () => {
  it("normalizes unsupported filters to all", () => {
    assert.equal(normalizeAnnouncementFilter("maintenance"), "all");
    assert.equal(normalizeAnnouncementFilter("urgent"), "urgent");
  });

  it("sorts urgent notices first and then by newest sent time without mutation", () => {
    const input = [
      notice({ id: "life", sentAt: "2026-07-14T09:00:00+09:00" }),
      notice({ id: "older-urgent", category: "urgent", sentAt: "2026-07-12T09:00:00+09:00" }),
      notice({ id: "newer-urgent", category: "urgent", sentAt: "2026-07-13T09:00:00+09:00" }),
    ];
    assert.deepEqual(selectAnnouncements(input, { filter: "all", query: "" }).map(({ id }) => id), [
      "newer-urgent",
      "older-urgent",
      "life",
    ]);
    assert.deepEqual(input.map(({ id }) => id), ["life", "older-urgent", "newer-urgent"]);
  });

  it("filters building scope and searches title body and sender", () => {
    const input = [
      notice({ id: "building", scope: "building", sender: "우주팀" }),
      notice({ id: "unit", scope: "unit", title: "개별 호실 안내" }),
    ];
    assert.deepEqual(selectAnnouncements(input, { filter: "building", query: "우주" }).map(({ id }) => id), ["building"]);
    assert.deepEqual(selectAnnouncements(input, { filter: "all", query: "호실" }).map(({ id }) => id), ["unit"]);
  });

  it("builds encoded list and detail URLs", () => {
    assert.equal(tenantAnnouncementDetailHref("ann / 1"), "/tenant/messaging/02/ann%20%2F%201");
    assert.equal(tenantAnnouncementListHref("life", "옥상 정원"), "/tenant/messaging/02?filter=life&q=%EC%98%A5%EC%83%81+%EC%A0%95%EC%9B%90");
  });
});
