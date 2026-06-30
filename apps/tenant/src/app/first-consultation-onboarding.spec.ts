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
    assert.equal(onboarding.starterPrompts.length, 3);
    for (const prompt of onboarding.starterPrompts) {
      assert.match(prompt, /정글빌라 301호/);
      assert.match(prompt, /언제부터|오늘|어제|이번 달/);
      assert.match(prompt, /위험|안전|전기|냄새|잠금/);
      assert.match(prompt, /사진|첨부|없습니다/);
      assert.match(prompt, /방문 가능|확인 가능|연락 가능/);
    }
  });

  it("falls back to a room-connected label when detailed room fields are still loading", () => {
    assert.equal(
      firstConsultationOnboarding({ roomId: "room-305" }).title,
      "연결된 호실 첫 AI 상담 준비"
    );
  });
});
