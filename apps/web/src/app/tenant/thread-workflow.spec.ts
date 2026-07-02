import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  consultationThreadBadges,
  consultationThreadNextAction,
  type TenantThreadWorkflowSummary
} from "./thread-workflow";

const baseSummary: TenantThreadWorkflowSummary = {
  statusLabel: "추가 정보 2개 필요",
  channelLabel: "AI 채팅",
  priority: 2,
  attachmentCount: 0,
  collectedSlotCount: 4,
  openSlotCount: 2,
  requiredInfoCount: 2,
  unresolvedQuestionCount: 3,
  readyToFinalize: false
};

describe("tenant consultation thread workflow", () => {
  it("surfaces the next concrete action for an incomplete AI consultation", () => {
    assert.equal(consultationThreadNextAction(baseSummary), "AI 질문 3개에 답변");
  });

  it("prioritizes finalization once the draft is ready", () => {
    assert.equal(
      consultationThreadNextAction({
        ...baseSummary,
        statusLabel: "접수 확정 가능",
        openSlotCount: 0,
        requiredInfoCount: 0,
        unresolvedQuestionCount: 0,
        readyToFinalize: true
      }),
      "초안 확인 후 접수 확정"
    );
  });

  it("builds concise workflow badges from thread state", () => {
    assert.deepEqual(consultationThreadBadges(baseSummary), [
      { label: "AI 채팅", tone: "neutral" },
      { label: "P2", tone: "priority" },
      { label: "정보 4/6", tone: "neutral" },
      { label: "추가 확인 2", tone: "warning" },
      { label: "AI 질문 3", tone: "info" }
    ]);
  });

  it("shows stored photo evidence and ready state without warning badges", () => {
    assert.deepEqual(
      consultationThreadBadges({
        ...baseSummary,
        statusLabel: "접수 확정 가능",
        attachmentCount: 2,
        collectedSlotCount: 6,
        openSlotCount: 0,
        requiredInfoCount: 0,
        unresolvedQuestionCount: 0,
        readyToFinalize: true
      }),
      [
        { label: "AI 채팅", tone: "neutral" },
        { label: "P2", tone: "priority" },
        { label: "정보 6/6", tone: "neutral" },
        { label: "사진 2", tone: "info" },
        { label: "접수 가능", tone: "ready" }
      ]
    );
  });
});
