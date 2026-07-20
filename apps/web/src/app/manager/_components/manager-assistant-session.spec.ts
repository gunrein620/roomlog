import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as managerAssistantSession from "./manager-assistant-session";
import {
  initialManagerAssistantSessionState,
  reduceManagerAssistantSession,
  toManagerCopilotMessages,
} from "./manager-assistant-session";

describe("manager assistant session", () => {
  it("selects and switches modes without losing transcript or pending action", () => {
    const withMessage = reduceManagerAssistantSession(initialManagerAssistantSessionState, {
      type: "append",
      entry: {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        content: "수납 현황입니다.",
      },
    });
    const withPending = reduceManagerAssistantSession(withMessage, {
      type: "set_pending_action",
      pendingAction: {
        id: "pending-1",
        kind: "billing.send_dunning",
        summary: "411호 독촉",
      },
    });

    const voice = reduceManagerAssistantSession(withPending, {
      type: "select_mode",
      mode: "voice",
    });

    assert.equal(voice.stage, "conversation");
    assert.equal(voice.mode, "voice");
    assert.equal(voice.entries.length, 1);
    assert.equal(voice.pendingAction?.id, "pending-1");
  });

  it("sends only user and assistant message entries to the text API", () => {
    const messages = toManagerCopilotMessages([
      { id: "u1", kind: "message", role: "user", content: "이번 달 수납" },
      { id: "s1", kind: "message", role: "system", content: "연결됨" },
      { id: "r1", kind: "receipt", receiptKind: "billing", summary: "조회 완료" },
      {
        id: "a1",
        kind: "message",
        role: "assistant",
        content: "수납률은 92%입니다.",
      },
    ]);

    assert.deepEqual(messages, [
      { role: "user", content: "이번 달 수납" },
      { role: "assistant", content: "수납률은 92%입니다." },
    ]);
  });

  it("treats only 승인 and 진행해 as pending-action text confirmation", () => {
    const managerAssistantPendingTextCommand = (
      managerAssistantSession as typeof managerAssistantSession & {
        managerAssistantPendingTextCommand?: (value: string) => "confirm" | null;
      }
    ).managerAssistantPendingTextCommand;

    assert.equal(managerAssistantPendingTextCommand?.("승인"), "confirm");
    assert.equal(managerAssistantPendingTextCommand?.(" 진행해 "), "confirm");
    assert.equal(managerAssistantPendingTextCommand?.("네"), null);
    assert.equal(managerAssistantPendingTextCommand?.("승인 취소"), null);
  });
});
