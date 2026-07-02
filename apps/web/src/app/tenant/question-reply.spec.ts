import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { appendQuestionReplyPrompt, replyPromptForQuestion } from "./question-reply";

describe("question reply prompts", () => {
  it("turns an AI next question into a tenant answer prompt", () => {
    assert.equal(
      replyPromptForQuestion("언제부터 시작됐고 지금도 같은 증상이 계속되고 있나요?"),
      "언제부터 시작됐고 지금도 같은 증상이 계속되고 있나요?\n답변: "
    );
  });

  it("appends a question prompt without replacing the current composer text", () => {
    assert.equal(
      appendQuestionReplyPrompt(
        "사진은 지금 바로 올릴 수 있습니다.",
        "전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?"
      ),
      [
        "사진은 지금 바로 올릴 수 있습니다.",
        "",
        "전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?",
        "답변: "
      ].join("\n")
    );
  });

  it("does not duplicate the same question prompt in the composer", () => {
    const current = [
      "전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?",
      "답변: 없습니다."
    ].join("\n");

    assert.equal(
      appendQuestionReplyPrompt(
        current,
        "전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?"
      ),
      current
    );
  });
});
