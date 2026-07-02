import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { consultationThreadContextHighlights } from "./thread-context";

const collectedSlots = [
  {
    key: "symptom",
    label: "증상",
    status: "COLLECTED" as const,
    value: "화장실 천장에서 물이 계속 떨어짐",
    evidence: "세입자가 천장 누수를 설명함"
  },
  {
    key: "location",
    label: "위치",
    status: "COLLECTED" as const,
    value: "301호 화장실 천장",
    evidence: "세입자가 위치를 말함"
  },
  {
    key: "visitTime",
    label: "방문 가능",
    status: "COLLECTED" as const,
    value: "오늘 저녁 7시 이후",
    evidence: "방문 가능 시간 확인"
  }
];

describe("tenant consultation thread context", () => {
  it("keeps the selected thread's collected context visible above the chat", () => {
    const highlights = consultationThreadContextHighlights({
      summary: {
        channelLabel: "AI 채팅",
        messageCount: 5,
        attachmentCount: 2,
        unresolvedQuestionCount: 0,
        readyToFinalize: true
      },
      draft: {
        category: "하자",
        detailCategory: "누수",
        priority: 1,
        responsibilityHint: "임대인 책임 가능성",
        location: "301호 화장실 천장",
        availableTimes: "오늘 저녁 7시 이후",
        photoRequested: false,
        requiredInfo: [],
        nextQuestions: [],
        intakeSlots: collectedSlots,
        photoAnalysis: {
          attachmentUrls: ["/api/files/leak-wide.png", "/api/files/leak-close.png"],
          previousAttachmentUrls: ["/api/files/move-in-bathroom.png"],
          comparisonStatus: "입주 전 사진과 비교 가능",
          summary: "천장 누수 사진 2장과 입주 전 기준 사진 1장을 함께 참고합니다."
        }
      }
    });

    assert.deepEqual(
      highlights.map((highlight) => [highlight.label, highlight.value, highlight.tone]),
      [
        ["상담", "AI 채팅 · 메시지 5", "neutral"],
        ["유형", "하자 / 누수 · P1", "priority"],
        ["증상", "화장실 천장에서 물이 계속 떨어짐", "info"],
        ["위치", "301호 화장실 천장", "info"],
        ["방문", "오늘 저녁 7시 이후", "info"],
        ["사진", "현재 2장 · 입주 전 1장 비교", "info"],
        ["상태", "접수 확정 가능", "ready"]
      ]
    );
  });

  it("surfaces missing visit time, photo, and next questions for an unfinished thread", () => {
    const highlights = consultationThreadContextHighlights({
      summary: {
        channelLabel: "AI 음성",
        messageCount: 2,
        attachmentCount: 0,
        unresolvedQuestionCount: 2,
        readyToFinalize: false
      },
      draft: {
        category: "설비",
        detailCategory: "도어락",
        priority: 1,
        responsibilityHint: "판단 어려움",
        photoRequested: true,
        requiredInfo: ["방문 가능 시간"],
        nextQuestions: [
          "오늘 몇 시에 확인 가능하신가요?",
          "문이 완전히 열리는 상태인가요?"
        ],
        intakeSlots: [
          {
            key: "symptom",
            label: "증상",
            status: "COLLECTED",
            value: "현관 도어락이 잠기지 않음",
            evidence: "음성 상담 전사"
          },
          {
            key: "visitTime",
            label: "방문 가능",
            status: "NEEDS_INFO",
            evidence: "방문 가능 시간이 아직 없음",
            action: "확인 가능한 시간을 물어보세요."
          }
        ],
        photoAnalysis: {
          attachmentUrls: [],
          previousAttachmentUrls: [],
          comparisonStatus: "추가 사진 필요",
          summary: "현재 상담 스레드에 사진이 없습니다."
        }
      }
    });

    assert.deepEqual(
      highlights.map((highlight) => [highlight.label, highlight.value, highlight.tone]),
      [
        ["상담", "AI 음성 · 메시지 2", "neutral"],
        ["유형", "설비 / 도어락 · P1", "priority"],
        ["증상", "현관 도어락이 잠기지 않음", "info"],
        ["방문", "방문 가능 시간 확인 필요", "warning"],
        ["사진", "근접/전체 사진 필요", "warning"],
        ["상태", "AI 질문 2개 답변 필요", "warning"]
      ]
    );
  });
});
