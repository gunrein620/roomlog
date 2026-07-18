import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  isTicketActivity,
  shouldRefreshTicketDashboard,
} from "./ticket-dashboard-activity";

describe("ticket dashboard activity", () => {
  it("accepts only ticket activity payloads", () => {
    assert.equal(isTicketActivity({ kind: "ticket" }), true);
    assert.equal(isTicketActivity({ kind: "ticket", action: "read" }), true);
    assert.equal(isTicketActivity({ kind: "messaging" }), false);
    assert.equal(isTicketActivity({}), false);
    assert.equal(isTicketActivity(null), false);
    assert.equal(isTicketActivity("ticket"), false);
  });

  it("refreshes ticket data changes but ignores manager read events", () => {
    assert.equal(shouldRefreshTicketDashboard({ kind: "ticket" }), true);
    assert.equal(
      shouldRefreshTicketDashboard({ kind: "ticket", action: "created" }),
      true,
    );
    assert.equal(
      shouldRefreshTicketDashboard({ kind: "ticket", action: "read" }),
      false,
    );
    assert.equal(shouldRefreshTicketDashboard({ kind: "messaging" }), false);
  });
});
