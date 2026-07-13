import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Announcement } from "@roomlog/types";
import { latestTenantAnnouncement } from "./tenant-announcement-card";

const announcement = (id: string, sentAt: string): Announcement => ({
  id,
  category: "life",
  scope: "building",
  title: id,
  body: `${id} 내용`,
  sender: "관리인",
  sentAt,
  confirmRequired: false,
  state: "unread",
});

describe("tenant announcement card", () => {
  it("returns null when the tenant has no delivered announcements", () => {
    assert.equal(latestTenantAnnouncement([]), null);
  });

  it("returns the newest delivered announcement without mutating the response", () => {
    const older = announcement("older", "2026-07-12T09:00:00+09:00");
    const newer = announcement("newer", "2026-07-13T09:00:00+09:00");
    const response = [older, newer];

    assert.equal(latestTenantAnnouncement(response)?.id, "newer");
    assert.deepEqual(response, [older, newer]);
  });
});
