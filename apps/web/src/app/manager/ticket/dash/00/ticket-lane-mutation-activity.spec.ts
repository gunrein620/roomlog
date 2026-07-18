import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  abandonLocalTicketLaneMutation,
  beginLocalTicketLaneMutation,
  completeLocalTicketLaneMutation,
  isLocalTicketLaneMutationActivity,
} from "./ticket-lane-mutation-activity";

describe("local ticket lane mutation activity", () => {
  it("suppresses only the matching local lane event through late delivery", () => {
    const requestId = "lane-request-1";
    const event = { kind: "ticket", action: "lane_changed", clientRequestId: requestId };

    beginLocalTicketLaneMutation(requestId);
    assert.equal(isLocalTicketLaneMutationActivity(event), true);
    assert.equal(
      isLocalTicketLaneMutationActivity({ ...event, clientRequestId: "another-request" }),
      false,
    );

    completeLocalTicketLaneMutation(requestId);
    assert.equal(isLocalTicketLaneMutationActivity(event), true);

    abandonLocalTicketLaneMutation(requestId);
    assert.equal(isLocalTicketLaneMutationActivity(event), false);
  });
});
