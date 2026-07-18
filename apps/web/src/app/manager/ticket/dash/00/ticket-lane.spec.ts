import { strict as assert } from "node:assert";
import test from "node:test";
import type { TicketStatus } from "@roomlog/types";
import { TICKET_LANES, canSwitchTicketLane, ticketLaneOf } from "./ticket-lane";

test("토글은 접수·진행·완료 3레인이다", () => {
  assert.deepEqual(TICKET_LANES.map(([value]) => value), [
    "received",
    "processing",
    "resolved",
  ]);
  assert.deepEqual(TICKET_LANES.map(([, label]) => label), ["접수", "진행", "완료"]);
});

test("세부 상태는 관리인이 보는 3레인으로 접힌다", () => {
  // 접수 레인: 아직 손대기 전이거나 세입자 응답을 기다리는 모든 상태
  for (const status of ["received", "reviewing", "info_requested", "reopened"] as TicketStatus[]) {
    assert.equal(ticketLaneOf(status), "received", status);
  }

  assert.equal(ticketLaneOf("processing"), "processing");
  assert.equal(ticketLaneOf("resolved"), "resolved");
});

test("취소 건은 어떤 레인에도 속하지 않고 토글이 잠긴다", () => {
  assert.equal(ticketLaneOf("cancelled"), null);
  assert.equal(canSwitchTicketLane("cancelled"), false);
});

test("취소가 아닌 모든 상태는 토글할 수 있다", () => {
  for (const status of [
    "received",
    "reviewing",
    "info_requested",
    "processing",
    "resolved",
    "reopened",
  ] as TicketStatus[]) {
    assert.equal(canSwitchTicketLane(status), true, status);
  }
});
