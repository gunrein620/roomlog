import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnouncementDraft } from "@roomlog/types";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";

function draft(
  id: string,
  status: AnnouncementDraft["status"],
  updatedAt: string,
  title: string,
): AnnouncementDraft {
  return {
    id,
    category: "life",
    scope: "all",
    targetLabel: "전체 2세대",
    targetRoomIds: ["room-1", "room-2"],
    title,
    body: "본문",
    translations: [],
    confirmRequired: false,
    status,
    updatedAt,
  };
}

describe("manager saved announcement drafts", () => {
  it("keeps only unsent drafts and sorts the newest update first", () => {
    const drafts = [
      draft("old", "draft", "2026-07-14T01:00:00.000Z", "이전 초안"),
      draft("sent", "sent", "2026-07-16T03:00:00.000Z", "발송 완료"),
      draft("new", "draft", "2026-07-15T02:00:00.000Z", "최근 초안"),
    ];

    assert.deepEqual(
      selectSavedAnnouncementDrafts(drafts).map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(drafts.map((item) => item.id), ["old", "sent", "new"]);
  });

  it("uses a readable label for a draft without a title", () => {
    assert.equal(savedAnnouncementDraftTitle({ title: "   " }), "제목 없는 공지");
    assert.equal(savedAnnouncementDraftTitle({ title: "  생활 안내  " }), "생활 안내");
  });
});
