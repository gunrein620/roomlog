import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeQuickReplyMessageId } from "./chat-quick-replies";
import { ChatMessageBody } from "./page";

describe("tenant chat quick replies", () => {
  it("activates quick replies only on the latest assistant message in an active thread", () => {
    const messages = [
      { id: "tenant-1", sender: "TENANT" },
      { id: "ai-1", sender: "AI_ASSISTANT" },
      { id: "tenant-2", sender: "TENANT" },
      { id: "ai-2", sender: "AI_ASSISTANT" }
    ];

    assert.equal(activeQuickReplyMessageId(messages, "ACTIVE"), "ai-2");
  });

  it("does not activate old quick replies after a tenant follow-up or closed thread", () => {
    const messages = [
      { id: "ai-1", sender: "AI_ASSISTANT" },
      { id: "tenant-1", sender: "TENANT" }
    ];

    assert.equal(activeQuickReplyMessageId(messages, "ACTIVE"), undefined);
    assert.equal(activeQuickReplyMessageId(messages, "FINALIZED"), undefined);
  });

  it("hides inactive quick reply examples instead of leaving disabled old buttons", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatMessageBody, {
        text: "다음으로 확인할 질문\n- 사진을 올려주실 수 있나요?\n바로 답변 예시: 지금 올릴게요 / 저녁에 올릴게요"
      })
    );

    assert.doesNotMatch(markup, /quick-replies/);
    assert.doesNotMatch(markup, /disabled/);
    assert.doesNotMatch(markup, /저녁에 올릴게요/);
  });
});
