import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  appendQuestionAnswerPrompt,
  appendQuestionReplyPrompt,
  replyPromptForQuestion,
  suggestedAnswersForQuestion
} from "./question-reply";

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

  it("suggests focused reply shortcuts for safety, visit time, and photo questions", () => {
    assert.deepEqual(
      suggestedAnswersForQuestion("전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?"),
      ["위험한 상황은 없습니다.", "지금도 위험해서 빠른 확인이 필요합니다."]
    );
    assert.deepEqual(
      suggestedAnswersForQuestion("오늘 몇 시에 확인 가능하신가요?"),
      ["오늘 저녁 7시 이후 가능합니다.", "내일 오전 가능합니다.", "시간 조율이 필요합니다."]
    );
    assert.deepEqual(
      suggestedAnswersForQuestion("문제 부위 사진을 보내주실 수 있나요?"),
      ["사진을 지금 첨부하겠습니다.", "통화 중이라 사진은 나중에 올리겠습니다."]
    );
    assert.deepEqual(
      suggestedAnswersForQuestion("언제부터 시작됐고 지금도 같은 증상이 계속되고 있나요?"),
      ["지금도 계속되고 있습니다.", "현재는 멈췄지만 다시 반복됩니다."]
    );
  });

  it("adds the selected shortcut answer without duplicating an existing question", () => {
    assert.equal(
      appendQuestionAnswerPrompt(
        "화장실 천장에서 물이 떨어집니다.",
        "오늘 몇 시에 확인 가능하신가요?",
        "오늘 저녁 7시 이후 가능합니다."
      ),
      [
        "화장실 천장에서 물이 떨어집니다.",
        "",
        "오늘 몇 시에 확인 가능하신가요?",
        "답변: 오늘 저녁 7시 이후 가능합니다."
      ].join("\n")
    );

    assert.equal(
      appendQuestionAnswerPrompt(
        ["오늘 몇 시에 확인 가능하신가요?", "답변: 오늘 저녁 7시 이후 가능합니다."].join(
          "\n"
        ),
        "오늘 몇 시에 확인 가능하신가요?",
        "내일 오전 가능합니다."
      ),
      ["오늘 몇 시에 확인 가능하신가요?", "답변: 오늘 저녁 7시 이후 가능합니다."].join(
        "\n"
      )
    );
  });
});
