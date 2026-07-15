import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { savedDraftsModalHref } from "./manager-section-nav-state";

describe("manager section saved drafts action", () => {
  it("shows only on announcement compose and preserves the editing draft id", () => {
    assert.equal(
      savedDraftsModalHref("/manager/messaging/00", new URLSearchParams()),
      null,
    );
    assert.equal(
      savedDraftsModalHref(
        "/manager/messaging/01",
        new URLSearchParams("id=draft_1"),
      ),
      "/manager/messaging/01?id=draft_1&drafts=open",
    );
  });
});
