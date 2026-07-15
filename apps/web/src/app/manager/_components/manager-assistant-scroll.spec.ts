import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldManagerAssistantStickToBottom } from "./manager-assistant-scroll";

describe("manager assistant sticky scroll", () => {
  it("tracks new messages while the transcript is within 95px of the bottom", () => {
    assert.equal(
      shouldManagerAssistantStickToBottom({
        scrollHeight: 1000,
        scrollTop: 505,
        clientHeight: 400,
      }),
      true,
    );
  });

  it("preserves manual reading position from 96px above the bottom", () => {
    assert.equal(
      shouldManagerAssistantStickToBottom({
        scrollHeight: 1000,
        scrollTop: 504,
        clientHeight: 400,
      }),
      false,
    );
  });
});
