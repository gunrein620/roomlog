import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { threadCaseFile } from "./thread-case-file";

const baseInput = {
  summary: {
    title: "301호 화장실 천장 누수",
    channelLabel: "AI 채팅",
    statusLabel: "접수 확정 가능",
    priority: 1 as const,
    attachmentCount: 2,
    collectedSlotCount: 6,
    openSlotCount: 0,
    unresolvedQuestionCount: 0,
    readyToFinalize: true
  },
  draft: {
    summary: "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고입니다.",
    category: "하자",
    detailCategory: "누수",
    priority: 1 as const,
    responsibilityHint: "임대인 책임 가능성",
    recommendedAction: "관리자에게 긴급 확인을 요청하세요.",
    location: "301호 화장실 천장",
    availableTimes: "오늘 저녁 7시 이후",
    requiredInfo: [],
    nextQuestions: [],
    tenantGuidance: [
      "물이 전기 설비 근처로 번지면 스위치나 콘센트를 만지지 말아주세요."
    ],
    photoRequested: false,
    photoAnalysis: {
      attachmentUrls: ["/api/files/current-wide.png", "/api/files/current-close.png"],
      previousAttachmentUrls: ["/api/files/move-in-ceiling.png"],
      comparisonStatus: "신규 발생 가능성",
      summary: "현재 사진 2장과 입주 전 기준 사진 1장을 비교합니다.",
      candidates: ["누수"],
      recommendedRetake: false
    },
    intakeSlots: [
      {
        key: "symptom",
        label: "증상",
        status: "COLLECTED" as const,
        value: "화장실 천장에서 물이 계속 떨어짐",
        evidence: "세입자 대화"
      },
      {
        key: "risk",
        label: "위험",
        status: "COLLECTED" as const,
        value: "바닥 물고임",
        evidence: "세입자 대화"
      }
    ]
  }
};

describe("tenant thread case file", () => {
  it("summarizes the active AI consultation as a thread-specific case file", () => {
    const caseFile = threadCaseFile(baseInput);

    assert.equal(caseFile.title, "301호 화장실 천장 누수");
    assert.equal(caseFile.status, "접수 확정 가능");
    assert.deepEqual(
      caseFile.facts.map((fact) => [fact.label, fact.value, fact.tone]),
      [
        ["채널", "AI 채팅", "neutral"],
        ["유형", "하자 / 누수", "priority"],
        ["긴급도", "P1", "priority"],
        ["위치", "301호 화장실 천장", "info"],
        ["방문", "오늘 저녁 7시 이후", "info"],
        ["사진", "현재 2장 · 입주 전 1장", "info"]
      ]
    );
    assert.deepEqual(caseFile.findings, [
      "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고입니다.",
      "책임 가능성: 임대인 책임 가능성",
      "사진 판단: 신규 발생 가능성 · 현재 사진 2장과 입주 전 기준 사진 1장을 비교합니다."
    ]);
    assert.deepEqual(caseFile.nextActions, [
      "민원 접수 확정",
      "관리자에게 긴급 확인을 요청하세요.",
      "물이 전기 설비 근처로 번지면 스위치나 콘센트를 만지지 말아주세요."
    ]);
    assert.deepEqual(
      caseFile.actions.map((action) => [action.kind, action.label]),
      [["FINALIZE", "민원 접수 확정"]]
    );
  });

  it("prioritizes missing photo, AI questions, and visit time for unfinished threads", () => {
    const caseFile = threadCaseFile({
      ...baseInput,
      summary: {
        ...baseInput.summary,
        statusLabel: "추가 정보 3개 필요",
        attachmentCount: 0,
        collectedSlotCount: 3,
        openSlotCount: 3,
        unresolvedQuestionCount: 2,
        readyToFinalize: false
      },
      draft: {
        ...baseInput.draft,
        availableTimes: "",
        requiredInfo: ["방문 가능 시간"],
        nextQuestions: [
          "문제 부위 근접 사진과 공간 전체 사진을 올려주실 수 있나요?",
          "오늘 몇 시 이후 방문 가능하신가요?"
        ],
        photoRequested: true,
        photoAnalysis: {
          ...baseInput.draft.photoAnalysis,
          attachmentUrls: [],
          previousAttachmentUrls: [],
          comparisonStatus: "추가 사진 필요",
          summary: "현재 상담 스레드에 사진이 없습니다.",
          recommendedRetake: true
        },
        intakeSlots: [
          ...baseInput.draft.intakeSlots,
          {
            key: "visitTime",
            label: "방문 가능",
            status: "NEEDS_INFO" as const,
            evidence: "방문 가능 시간이 아직 없음",
            action: "방문 가능한 시간을 확인하세요."
          }
        ]
      }
    });

    assert.equal(caseFile.status, "AI 질문 2개 답변 필요");
    assert.deepEqual(
      caseFile.facts.map((fact) => [fact.label, fact.value, fact.tone]),
      [
        ["채널", "AI 채팅", "neutral"],
        ["유형", "하자 / 누수", "priority"],
        ["긴급도", "P1", "priority"],
        ["위치", "301호 화장실 천장", "info"],
        ["방문", "확인 필요", "warning"],
        ["사진", "근접/전체 사진 필요", "warning"]
      ]
    );
    assert.deepEqual(caseFile.nextActions.slice(0, 3), [
      "문제 부위 근접 사진과 공간 전체 사진을 올려주실 수 있나요?",
      "오늘 몇 시 이후 방문 가능하신가요?",
      "방문 가능 시간 보완"
    ]);
    assert.deepEqual(
      caseFile.actions.slice(0, 3).map((action) => [action.kind, action.label]),
      [
        ["UPLOAD_PHOTO", "문제 부위 근접 사진과 공간 전체 사진을 올려주실 수 있나요?"],
        ["ANSWER_QUESTION", "오늘 몇 시 이후 방문 가능하신가요?"],
        ["ANSWER_QUESTION", "방문 가능 시간 보완"]
      ]
    );
  });
});
