import { strict as assert } from "node:assert";
import test from "node:test";
import {
  applyTicketLaneOverrides,
  reconcileTicketLaneOverrides,
  type TicketLaneOverride,
} from "./ticket-lane-local-state";

test("keeps a successful lane change in the table until server rows confirm it", () => {
  const rows = [
    {
      ticket: { id: "ticket-1", status: "received", updatedAt: "2026-07-18T10:00:00.000Z" },
      isManagerUnread: true,
    },
  ] as const;
  const overrides: TicketLaneOverride = {
    "ticket-1": { lane: "processing", updatedAt: "2026-07-18T10:01:00.000Z" },
  };

  const immediateRows = applyTicketLaneOverrides(rows, overrides);
  assert.equal(immediateRows[0]?.ticket.status, "processing");
  assert.equal(immediateRows[0]?.isManagerUnread, true);

  // router.refresh()가 이전 RSC 결과를 먼저 돌려줘도 첫 클릭의 상태를 되돌리지 않는다.
  assert.deepEqual(reconcileTicketLaneOverrides(overrides, rows), overrides);

  const confirmedRows = [
    {
      ticket: { id: "ticket-1", status: "processing", updatedAt: "2026-07-18T10:01:00.000Z" },
      isManagerUnread: true,
    },
  ] as const;
  assert.deepEqual(reconcileTicketLaneOverrides(overrides, confirmedRows), {});
});

test("accepts a newer server lane instead of permanently masking another manager's change", () => {
  const overrides: TicketLaneOverride = {
    "ticket-1": { lane: "processing", updatedAt: "2026-07-18T10:01:00.000Z" },
  };
  const newerRows = [
    {
      ticket: { id: "ticket-1", status: "resolved", updatedAt: "2026-07-18T10:02:00.000Z" },
    },
  ] as const;

  assert.deepEqual(reconcileTicketLaneOverrides(overrides, newerRows), {});
});
