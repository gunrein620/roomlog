import assert from "node:assert/strict";
import test from "node:test";
import { replyActionForIntent, validateReplyMessage } from "./ticket-reply-action";

test("photo and detail requests transition the ticket to additional-info requested", () => {
  assert.equal(replyActionForIntent("REQUEST_PHOTO"), "REQUEST_ADDITIONAL_INFO");
  assert.equal(replyActionForIntent("REQUEST_DETAILS"), "REQUEST_ADDITIONAL_INFO");
});

test("other reply intents send a normal ticket reply", () => {
  assert.equal(replyActionForIntent("RECEIPT_ACK"), "SEND_REPLY");
  assert.equal(replyActionForIntent("SCHEDULE_VISIT"), "SEND_REPLY");
  assert.equal(replyActionForIntent("ASSIGN_VENDOR_NOTICE"), "SEND_REPLY");
  assert.equal(replyActionForIntent("COMPLETION_NOTICE"), "SEND_REPLY");
});

test("edited reply content must not be empty", () => {
  assert.equal(validateReplyMessage("  "), "전송할 답변 내용을 입력해주세요.");
  assert.equal(validateReplyMessage("확인 후 안내드리겠습니다."), null);
});
