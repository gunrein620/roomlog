import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { shouldAutoFinalizeConsultation } from "./auto-finalize-consultation";

const readySession = {
  status: "ACTIVE",
  draft: {
    readyToFinalize: true,
    requiredInfo: [],
    duplicateCandidates: [],
    location: "301호 화장실",
    availableTimes: "내일 오후 2시",
    photoAnalysis: {
      attachmentUrls: ["/api/files/sink.jpg"]
    },
    intakeSlots: [
      { key: "symptom", status: "COLLECTED" },
      { key: "location", status: "COLLECTED" },
      { key: "photo", status: "COLLECTED" },
      { key: "visitTime", status: "COLLECTED" }
    ]
  },
  threadSummary: {
    readyToFinalize: true,
    openSlotCount: 0,
    unresolvedQuestionCount: 0
  }
};

describe("auto finalize consultation", () => {
  it("allows simple ready AI consultations to be finalized automatically", () => {
    assert.equal(shouldAutoFinalizeConsultation(readySession), true);
  });

  it("auto finalizes photo-backed demo consultations despite soft follow-up questions", () => {
    assert.equal(
      shouldAutoFinalizeConsultation({
        ...readySession,
        draft: {
          ...readySession.draft,
          readyToFinalize: false,
          requiredInfo: ["발생 시점"],
          duplicateCandidates: [{ ticketId: "ticket-1" }]
        },
        threadSummary: {
          readyToFinalize: false,
          openSlotCount: 1,
          unresolvedQuestionCount: 2
        }
      }),
      true
    );
  });

  it("keeps unfinished or closed consultations manual", () => {
    assert.equal(
      shouldAutoFinalizeConsultation({
        ...readySession,
        draft: {
          ...readySession.draft,
          readyToFinalize: false,
          requiredInfo: ["방문 가능 시간"],
          availableTimes: undefined
        }
      }),
      false
    );
    assert.equal(
      shouldAutoFinalizeConsultation({
        ...readySession,
        status: "FINALIZED"
      }),
      false
    );
    assert.equal(
      shouldAutoFinalizeConsultation({
        ...readySession,
        draft: {
          ...readySession.draft,
          readyToFinalize: false,
          requiredInfo: ["발생 시점"],
          photoAnalysis: { attachmentUrls: [] }
        }
      }),
      false
    );
  });
});
