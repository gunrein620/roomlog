import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { chatMessageBlocks } from "./chat-message-format";

describe("tenant chat message formatting", () => {
  it("keeps structured AI 상담 replies readable as headings and bullet lists", () => {
    assert.deepEqual(
      chatMessageBlocks(
        [
          "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요.",
          "제가 이해한 내용",
          "- 301호 화장실 천장에서 물이 계속 떨어집니다.",
          "- 분류: 하자 / 누수, 긴급도 P1",
          "",
          "지금 할 일",
          "- 전기 스위치 주변은 만지지 말아주세요.",
          "- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올려주세요.",
          "접수 상태",
          "- 답변과 사진은 이 상담 스레드에 이어서 저장됩니다."
        ].join("\n")
      ),
      [
        {
          kind: "paragraph",
          text: "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요."
        },
        { kind: "heading", text: "제가 이해한 내용" },
        {
          kind: "list",
          items: [
            "301호 화장실 천장에서 물이 계속 떨어집니다.",
            "분류: 하자 / 누수, 긴급도 P1"
          ]
        },
        { kind: "heading", text: "지금 할 일" },
        {
          kind: "list",
          items: [
            "전기 스위치 주변은 만지지 말아주세요.",
            "문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올려주세요."
          ]
        },
        { kind: "heading", text: "접수 상태" },
        {
          kind: "list",
          items: ["답변과 사진은 이 상담 스레드에 이어서 저장됩니다."]
        }
      ]
    );
  });

  it("renders a plain tenant message as one paragraph", () => {
    assert.deepEqual(chatMessageBlocks("오늘 저녁 8시 이후 방문 가능합니다."), [
      { kind: "paragraph", text: "오늘 저녁 8시 이후 방문 가능합니다." }
    ]);
  });

  it("extracts quick reply examples from assistant questions", () => {
    assert.deepEqual(
      chatMessageBlocks(
        [
          "다음으로 확인할 질문",
          "- 물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?",
          "  바로 답변 예시: 지금도 떨어지고 있어요 / 전기 주변은 아니에요 / 조명 근처까지 번졌어요",
          "- 관리자나 업체가 확인할 수 있는 방문 가능 시간대가 언제인가요?",
          "  바로 답변 예시: 오늘 저녁 7시 이후 / 내일 오전 10시부터 12시 사이"
        ].join("\n")
      ),
      [
        { kind: "heading", text: "다음으로 확인할 질문" },
        {
          kind: "list",
          items: [
            "물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?",
            "관리자나 업체가 확인할 수 있는 방문 가능 시간대가 언제인가요?"
          ]
        },
        {
          kind: "quickReplies",
          replies: [
            "지금도 떨어지고 있어요",
            "전기 주변은 아니에요",
            "조명 근처까지 번졌어요",
            "오늘 저녁 7시 이후",
            "내일 오전 10시부터 12시 사이"
          ]
        }
      ]
    );
  });
});
