import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { firstConsultationOnboarding } from "./first-consultation-onboarding";

describe("tenant first consultation onboarding", () => {
  it("uses the connected room instead of generic mock copy for a newly signed-up tenant", () => {
    const onboarding = firstConsultationOnboarding({
      buildingName: "정글빌라",
      roomNo: "301호"
    });

    assert.equal(onboarding.title, "정글빌라 301호 첫 AI 상담 준비");
    assert.match(onboarding.description, /상담마다 독립 스레드/);
    assert.match(onboarding.description, /사진과 대화 기록/);
    assert.deepEqual(
      onboarding.steps.map((step) => step.title),
      ["상황 설명", "사진 첨부", "초안 확인"]
    );
    assert.deepEqual(onboarding.starterPrompts, [
      "화장실 천장에서 물이 떨어지고 있습니다. 언제부터인지, 지금도 계속 새는지 확인해주세요.",
      "보일러가 작동하지 않습니다. 온수와 난방 중 어떤 문제가 더 큰지 정리해주세요.",
      "월세나 관리비 청구 내역이 이상합니다. 계약/납부 기록 기준으로 확인해주세요."
    ]);
  });

  it("falls back to a room-connected label when detailed room fields are still loading", () => {
    assert.equal(
      firstConsultationOnboarding({ roomId: "room-305" }).title,
      "연결된 호실 첫 AI 상담 준비"
    );
  });
});
