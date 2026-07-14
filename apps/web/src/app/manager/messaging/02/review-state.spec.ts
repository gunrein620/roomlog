import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announcementRecipientState } from "./review-state";

describe("manager announcement recipient state", () => {
  it("blocks sending and explains an empty contract recipient list", () => {
    assert.deepEqual(announcementRecipientState(0), {
      canSend: false,
      emptyMessage: "연결된 계약 세입자가 없습니다. 계약 세입자를 연결한 뒤 발송해 주세요.",
    });
  });

  it("allows sending when at least one contract tenant is linked", () => {
    assert.deepEqual(announcementRecipientState(1), { canSend: true });
  });
});
