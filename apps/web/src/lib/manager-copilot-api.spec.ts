import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { managerPendingActionFromConfirmation } from "./manager-copilot-api";

describe("manager copilot confirmation reconciliation", () => {
  it("restores a persisted dunning confirmation for the assistant session", () => {
    assert.deepEqual(
      managerPendingActionFromConfirmation({
        confirmationId: "confirmation-1",
        tool: "billing.send_dunning",
        expiresAt: "2026-07-20T12:00:00.000Z",
        card: {
          title: "연체 독촉 발송 확인",
          target: "102호 7월분 독촉",
          action: "청구 상태를 다시 확인한 뒤 발송합니다.",
        },
      }),
      {
        id: "confirmation-1",
        kind: "billing.send_dunning",
        summary: "102호 7월분 독촉",
      },
    );
  });

  it("ignores pending actions that the assistant does not render", () => {
    assert.equal(
      managerPendingActionFromConfirmation({
        confirmationId: "confirmation-2",
        tool: "vendor.assign",
        card: { target: "업체 A" },
      }),
      null,
    );
  });
});
