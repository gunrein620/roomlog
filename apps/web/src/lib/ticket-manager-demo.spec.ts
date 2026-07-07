import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  MANAGER_DEMO_REPAIRS,
  MANAGER_DEMO_TICKETS,
  managerDemoAnalysis,
  managerDemoRepair,
  managerDemoSummary
} from "./ticket-manager-demo";

describe("manager ticket demo fallback data", () => {
  it("keeps five ticket rows with analysis and repair details", () => {
    const titles = MANAGER_DEMO_TICKETS.map((ticket) => ticket.title).join("\n");
    const summary = managerDemoSummary();

    assert.equal(MANAGER_DEMO_TICKETS.length, 5, "티켓 데모 폴백은 5건이어야 한다.");
    assert.equal(Object.keys(MANAGER_DEMO_REPAIRS).length, 5, "수리 하위 데이터도 5건이어야 한다.");
    assert.equal(summary.total, 5);
    assert.match(titles, /에어컨/);
    assert.match(titles, /세면대/);

    for (const ticket of MANAGER_DEMO_TICKETS) {
      assert.equal(managerDemoAnalysis(ticket.id).ticketId, ticket.id);
      assert.equal(managerDemoRepair(ticket.id).ticketId, ticket.id);
    }
  });
});
