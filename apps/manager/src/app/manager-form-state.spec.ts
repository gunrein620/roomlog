import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  canSubmitManagerAssistantQuestion,
  initialFeedbackReviewNote,
  initialManagerAssistantQuestion
} from "./manager-form-state";

describe("manager form state", () => {
  it("starts AI assistant query empty instead of prefilled with a demo request", () => {
    assert.equal(initialManagerAssistantQuestion(), "");
  });

  it("starts feedback review notes empty so managers write actual review context", () => {
    assert.equal(initialFeedbackReviewNote(), "");
  });

  it("requires a real manager assistant question before submitting", () => {
    assert.equal(canSubmitManagerAssistantQuestion(""), false);
    assert.equal(canSubmitManagerAssistantQuestion("   "), false);
    assert.equal(canSubmitManagerAssistantQuestion("콜봇 미처리 티켓 보여줘"), true);
  });
});
