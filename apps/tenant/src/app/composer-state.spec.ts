import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  initialConsultationComposerText,
  resetConsultationComposerState
} from "./composer-state";

describe("tenant consultation composer state", () => {
  it("starts empty instead of prefilled with a mock complaint", () => {
    assert.equal(initialConsultationComposerText(), "");
  });

  it("clears carried text and selected photos when a new consultation thread starts", () => {
    assert.deepEqual(
      resetConsultationComposerState({
        text: "이전 스레드 질문 답변",
        photoCount: 2,
        photoInputKey: 4
      }),
      {
        text: "",
        photoCount: 0,
        photoInputKey: 5
      }
    );
  });
});
