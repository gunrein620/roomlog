import { strict as assert } from "node:assert";
import test from "node:test";
import type { TicketThreadMessage } from "@roomlog/types";
import { appendTicketMessage, ticketMessageFor } from "./ticket-message-event";

const message: TicketThreadMessage = {
  id: "msg_1",
  senderRole: "TENANT",
  messageText: "물이 안 내려가요",
  attachmentUrls: [],
  createdAt: "2026-07-18T09:00:00.000Z",
};

test("이 티켓의 메시지만 꺼낸다", () => {
  assert.deepEqual(ticketMessageFor("tkt_1", { ticketId: "tkt_1", message }), message);
  assert.equal(ticketMessageFor("tkt_1", { ticketId: "tkt_2", message }), null);
});

test("형태가 어긋난 페이로드는 화면에 붙이지 않는다", () => {
  for (const payload of [
    undefined,
    null,
    "문자열",
    {},
    { ticketId: "tkt_1" },
    { ticketId: "tkt_1", message: {} },
    { ticketId: "tkt_1", message: { id: "msg_1" } },
    { ticketId: "tkt_1", message: { messageText: "본문만" } },
  ]) {
    assert.equal(ticketMessageFor("tkt_1", payload), null, JSON.stringify(payload));
  }
});

test("attachmentUrls가 빠졌거나 이상해도 배열로 맞춘다", () => {
  const recovered = ticketMessageFor("tkt_1", {
    ticketId: "tkt_1",
    message: { ...message, attachmentUrls: undefined },
  });

  assert.deepEqual(recovered?.attachmentUrls, []);
});

test("같은 메시지는 두 번 붙지 않는다 — 소켓은 보낸 본인에게도 돌아온다", () => {
  const once = appendTicketMessage([], message);
  assert.equal(once.length, 1);

  const twice = appendTicketMessage(once, { ...message, messageText: "중복 방송" });
  assert.equal(twice.length, 1);
  assert.equal(twice, once, "변화가 없으면 같은 배열을 돌려줘 불필요한 리렌더를 막는다");
});

test("새 메시지는 스레드 끝에 붙는다", () => {
  const next: TicketThreadMessage = { ...message, id: "msg_2", messageText: "확인했습니다" };
  const appended = appendTicketMessage([message], next);

  assert.deepEqual(appended.map((item) => item.id), ["msg_1", "msg_2"]);
});
