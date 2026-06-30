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
});
