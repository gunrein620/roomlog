import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  copilotResponseEvents,
  copilotResponseStatus,
} from "./useManagerAssistantSession";

describe("manager assistant copilot response", () => {
  it("maps a successful response to assistant, pending action, and receipt events", () => {
    let sequence = 0;
    const events = copilotResponseEvents(
      {
        mode: "openai",
        reply: "발송 전 확인이 필요합니다.",
        pendingAction: {
          id: "p1",
          kind: "billing.send_dunning",
          summary: "411호 독촉",
        },
        receipts: [{ kind: "billing.send_dunning", summary: "발송 완료" }],
      },
      () => `fixed-${sequence += 1}`,
    );

    assert.deepEqual(events, [
      {
        type: "append",
        entry: {
          id: "fixed-1",
          kind: "message",
          role: "assistant",
          content: "발송 전 확인이 필요합니다.",
        },
      },
      {
        type: "set_pending_action",
        pendingAction: {
          id: "p1",
          kind: "billing.send_dunning",
          summary: "411호 독촉",
        },
      },
      {
        type: "append",
        entry: {
          id: "fixed-2",
          kind: "receipt",
          receiptKind: "billing.send_dunning",
          summary: "발송 완료",
        },
      },
    ]);
  });

  it("turns not-configured mode into a blocking notice", () => {
    assert.deepEqual(
      copilotResponseStatus({ mode: "not_configured", reply: "API 키 필요" }),
      { inputDisabled: true, notice: "API 키 필요" },
    );
  });

  it("can apply a voice tool result without duplicating its assistant reply", () => {
    const events = copilotResponseEvents(
      {
        mode: "openai",
        reply: "102호에 독촉을 발송했습니다.",
        receipts: [{ kind: "billing.send_dunning", summary: "발송 완료" }],
      },
      () => "fixed",
      { includeReply: false },
    );

    assert.equal(
      events.some(
        (event) => event.type === "append" && event.entry.kind === "message",
      ),
      false,
    );
    assert.equal(
      events.some(
        (event) => event.type === "append" && event.entry.kind === "receipt",
      ),
      true,
    );
  });
});
