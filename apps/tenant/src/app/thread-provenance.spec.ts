import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { threadProvenance } from "./thread-provenance";

describe("tenant thread provenance", () => {
  it("summarizes each consultation as a separate stored thread", () => {
    const provenance = threadProvenance({
      id: "sess_abc123456789",
      status: "ACTIVE",
      sourceChannel: "REALTIME_CHAT",
      complaintId: undefined,
      ticketId: undefined,
      messages: [
        {
          sender: "AI_ASSISTANT",
          attachmentUrls: []
        },
        {
          sender: "TENANT",
          attachmentUrls: ["/api/files/leak-wide.png", "/api/files/leak-close.png"]
        },
        {
          sender: "AI_ASSISTANT",
          attachmentUrls: []
        }
      ],
      threadSummary: {
        channelLabel: "AI 채팅",
        statusLabel: "추가 정보 확인 중",
        messageCount: 3,
        attachmentCount: 2
      }
    });

    assert.equal(provenance.title, "스레드 기록");
    assert.equal(provenance.status, "AI 채팅 · 추가 정보 확인 중");
    assert.deepEqual(
      provenance.items.map((item) => [item.label, item.value, item.tone]),
      [
        ["스레드", "sess_abc123456789", "neutral"],
        ["대화", "세입자 1건 · AI 2건", "info"],
        ["사진", "2장", "info"],
        ["접수", "초안 저장 중", "warning"]
      ]
    );
  });

  it("shows finalized ticket linkage instead of mock-looking draft state", () => {
    const provenance = threadProvenance({
      id: "sess_done",
      status: "FINALIZED",
      sourceChannel: "CALLBOT",
      complaintId: "cmp_final",
      ticketId: "tkt_final",
      messages: [
        {
          sender: "TENANT",
          attachmentUrls: []
        },
        {
          sender: "SYSTEM",
          attachmentUrls: []
        }
      ],
      threadSummary: {
        channelLabel: "콜봇",
        statusLabel: "접수 완료",
        messageCount: 2,
        attachmentCount: 0
      }
    });

    assert.equal(provenance.status, "콜봇 · 접수 완료");
    assert.deepEqual(provenance.items.at(-1), {
      label: "접수",
      value: "티켓 tkt_final",
      tone: "ready"
    });
  });
});
