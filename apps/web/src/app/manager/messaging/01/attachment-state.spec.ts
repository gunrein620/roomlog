import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnouncementTranslation } from "@roomlog/types";
import {
  buildAttachedTranslations,
  findAttachedTranslation,
  findVisibleTranslation,
} from "./attachment-state";

const english: AnnouncementTranslation = {
  lang: "en",
  langLabel: "English",
  title: "Emergency water outage",
  body: "Water will be unavailable from 14:00 to 16:00.",
  reviewed: false,
  sourceHash: "korean-source",
};

describe("manager announcement single-language attachment", () => {
  it("projects one selected translation into all required language slots", () => {
    const projected = buildAttachedTranslations(english);

    assert.deepEqual(projected.map((translation) => translation.lang), ["en", "zh", "vi"]);
    assert.equal(projected.every((translation) => translation.langLabel === "English"), true);
    assert.equal(projected.every((translation) => translation.title === english.title), true);
    assert.equal(projected.every((translation) => translation.body === english.body), true);
    assert.equal(projected.every((translation) => translation.reviewed), true);
  });

  it("detects only a complete projection that matches the final draft content", () => {
    const projected = buildAttachedTranslations(english);
    const attached = findAttachedTranslation({
      title: english.title,
      body: english.body,
      translations: projected,
    });

    assert.equal(attached?.langLabel, "English");
    assert.equal(findAttachedTranslation({
      title: "Different title",
      body: english.body,
      translations: projected,
    }), undefined);
    assert.equal(findAttachedTranslation({
      title: english.title,
      body: english.body,
      translations: projected.map((translation, index) => (
        index === 0 ? { ...translation, reviewed: false } : translation
      )),
    }), undefined);
  });

  it("shows a compatibility projection only in the selected language card", () => {
    const projected = buildAttachedTranslations(english);

    assert.equal(findVisibleTranslation(projected, "en", "English")?.title, english.title);
    assert.equal(findVisibleTranslation(projected, "zh", "中文"), undefined);
    assert.equal(findVisibleTranslation(projected, "vi", "Tiếng Việt"), undefined);
  });
});
