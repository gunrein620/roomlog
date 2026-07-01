import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { consultationComposerGuidance } from "./composer-guidance";

describe("tenant consultation composer guidance", () => {
  it("turns the current AI question into the active composer target", () => {
    const guidance = consultationComposerGuidance({
      status: "ACTIVE",
      draft: {
        nextQuestions: ["물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?"],
        requiredInfo: ["안전 위험 여부", "방문 가능 시간"],
        readyToFinalize: false,
        photoRequested: false,
        photoAnalysis: {
          comparisonStatus: "추가 사진 필요",
          recommendedRetake: false
        }
      },
      threadSummary: {
        readyToFinalize: false,
        unresolvedQuestionCount: 1,
        openSlotCount: 2
      }
    });

    assert.equal(guidance.label, "AI가 지금 확인할 질문");
    assert.equal(guidance.prompt, "물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?");
    assert.match(guidance.placeholder, /물이 지금도 떨어지고 있나요/);
    assert.equal(guidance.submitLabel, "답변 보내기");
    assert.equal(guidance.tone, "warning");
  });

  it("shifts to final confirmation guidance when the draft is ready", () => {
    const guidance = consultationComposerGuidance({
      status: "ACTIVE",
      draft: {
        nextQuestions: [],
        requiredInfo: [],
        readyToFinalize: true,
        photoRequested: false,
        photoAnalysis: {
          comparisonStatus: "비교 어려움",
          recommendedRetake: false
        }
      },
      threadSummary: {
        readyToFinalize: true,
        unresolvedQuestionCount: 0,
        openSlotCount: 0
      }
    });

    assert.equal(guidance.label, "접수 초안 준비됨");
    assert.equal(guidance.prompt, "내용이 맞으면 접수 확정을 누르고, 수정할 내용이 있으면 바로 적어주세요.");
    assert.equal(guidance.submitLabel, "추가 설명 보내기");
    assert.equal(guidance.tone, "ready");
  });
});
