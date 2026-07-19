import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createTicketDashboardRefreshGate } from "./ticket-dashboard-refresh-gate";

describe("ticket dashboard refresh gate", () => {
  it("defers an event while refresh is unsafe and flushes it exactly once", () => {
    const gate = createTicketDashboardRefreshGate();

    assert.equal(gate.request(false), false);
    assert.equal(gate.flush(false), false);
    assert.equal(gate.flush(true), true);
    assert.equal(gate.flush(true), false);
  });

  it("refreshes an immediately safe event without leaving pending work", () => {
    const gate = createTicketDashboardRefreshGate();

    assert.equal(gate.request(true), true);
    assert.equal(gate.flush(true), false);
  });
});
