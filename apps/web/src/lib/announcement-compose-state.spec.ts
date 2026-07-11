import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnouncementDraft, AnnouncementTranslation } from "@roomlog/types";
import {
  ANNOUNCEMENT_TRANSLATION_LANGUAGES,
  buildAnnouncementTarget,
  invalidateReviewedTranslations,
  prepareAnnouncementDraftForCompose,
  validateAnnouncementCompose,
} from "./announcement-compose-state";

const rooms = [
  { id: "room-a-101", buildingName: "A동", roomNo: "101호" },
  { id: "room-a-102", buildingName: "A동", roomNo: "102호" },
  { id: "room-b-201", buildingName: "B동", roomNo: "201호" },
];

const translations: AnnouncementTranslation[] = ANNOUNCEMENT_TRANSLATION_LANGUAGES.map(
  ({ lang, label }) => ({
    lang,
    langLabel: label,
    title: `${label} title`,
    body: `${label} body`,
    reviewed: true,
    sourceHash: "current-source",
  }),
);

const draftWithTranslations: AnnouncementDraft = {
  id: "announcement-draft",
  category: "urgent",
  scope: "building",
  targetLabel: "A동 전체 2세대",
  targetRoomIds: ["room-a-101", "room-a-102"],
  title: "긴급 안내",
  body: "긴급 안내 본문",
  translations,
  confirmRequired: true,
  status: "draft",
  updatedAt: "2026-07-11T00:00:00.000Z",
};

describe("manager announcement compose state", () => {
  it("clears demo translations for a new announcement", () => {
    const prepared = prepareAnnouncementDraftForCompose(draftWithTranslations, false);

    assert.deepEqual(prepared.translations, []);
    assert.notEqual(prepared, draftWithTranslations);
  });

  it("preserves translations for a persisted announcement", () => {
    const prepared = prepareAnnouncementDraftForCompose(draftWithTranslations, true);

    assert.deepEqual(prepared.translations, draftWithTranslations.translations);
  });

  it("derives exact room ids and labels for all, building, and unit targets", () => {
    assert.deepEqual(buildAnnouncementTarget(rooms, "all", "", []), {
      targetRoomIds: ["room-a-101", "room-a-102", "room-b-201"],
      targetLabel: "전체 3세대",
    });
    assert.deepEqual(buildAnnouncementTarget(rooms, "building", "A동", []), {
      targetRoomIds: ["room-a-101", "room-a-102"],
      targetLabel: "A동 전체 2세대",
    });
    assert.deepEqual(buildAnnouncementTarget(rooms, "unit", "", ["room-b-201"]), {
      targetRoomIds: ["room-b-201"],
      targetLabel: "B동 201호",
    });
  });

  it("invalidates every reviewed translation when the Korean source changes", () => {
    assert.deepEqual(
      invalidateReviewedTranslations(translations).map((translation) => translation.reviewed),
      [false, false, false],
    );
  });

  it("requires all three reviewed translations only for urgent announcements", () => {
    assert.deepEqual(
      validateAnnouncementCompose({
        category: "life",
        title: "생활 안내",
        body: "생활 안내 본문",
        targetRoomIds: ["room-a-101"],
        translations: [],
      }),
      [],
    );

    assert.deepEqual(
      validateAnnouncementCompose(
        {
          category: "urgent",
          title: "긴급 안내",
          body: "긴급 안내 본문",
          targetRoomIds: ["room-a-101"],
          translations: [],
        },
        { requireUrgentReviews: false },
      ),
      [],
    );

    assert.deepEqual(
      validateAnnouncementCompose({
        category: "urgent",
        title: "긴급 안내",
        body: "긴급 안내 본문",
        targetRoomIds: ["room-a-101"],
        translations: translations.slice(0, 2),
      }),
      ["긴급 공지는 English, 中文, Tiếng Việt 번역을 모두 검수해야 합니다."],
    );

    assert.deepEqual(
      validateAnnouncementCompose({
        category: "urgent",
        title: "긴급 안내",
        body: "긴급 안내 본문",
        targetRoomIds: ["room-a-101"],
        translations,
      }),
      [],
    );
  });
});
