import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTicketDashboardView } from "./ticket-dashboard-view";

describe("ticket dashboard view", () => {
  it("keeps the default route on the complaint dashboard", () => {
    assert.equal(resolveTicketDashboardView({}), "dashboard");
  });

  it("opens the combined management table for the management view", () => {
    assert.equal(resolveTicketDashboardView({ view: "management" }), "management");
  });

  it("preserves legacy type-filtered management links", () => {
    assert.equal(resolveTicketDashboardView({ type: "complaint" }), "complaint");
    assert.equal(resolveTicketDashboardView({ type: "defect" }), "defect");
  });
});
