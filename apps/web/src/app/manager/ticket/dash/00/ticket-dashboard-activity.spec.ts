import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isTicketActivity } from "./ticket-dashboard-activity";

describe("ticket dashboard activity", () => {
  it("accepts only ticket activity payloads", () => {
    assert.equal(isTicketActivity({ kind: "ticket" }), true);
    assert.equal(isTicketActivity({ kind: "messaging" }), false);
    assert.equal(isTicketActivity({}), false);
    assert.equal(isTicketActivity(null), false);
    assert.equal(isTicketActivity("ticket"), false);
  });
});
