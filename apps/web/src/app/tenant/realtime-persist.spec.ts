import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  beginRealtimeTurnPersist,
  completeRealtimeTurnPersist,
  emptyRealtimePersistState
} from "./realtime-persist";

describe("tenant realtime persistence", () => {
  it("allows retrying the same realtime event after a failed persist", () => {
    let state = emptyRealtimePersistState();

    const first = beginRealtimeTurnPersist(state, "resp_retry");
    assert.equal(first.shouldPersist, true);
    state = completeRealtimeTurnPersist(first.state, "resp_retry", false);

    const retry = beginRealtimeTurnPersist(state, "resp_retry");
    assert.equal(retry.shouldPersist, true);
    state = completeRealtimeTurnPersist(retry.state, "resp_retry", true);

    const duplicate = beginRealtimeTurnPersist(state, "resp_retry");
    assert.equal(duplicate.shouldPersist, false);
  });

  it("blocks concurrent realtime persists while one is in flight", () => {
    const first = beginRealtimeTurnPersist(emptyRealtimePersistState(), "resp_inflight");
    const concurrent = beginRealtimeTurnPersist(first.state, "resp_next");

    assert.equal(first.shouldPersist, true);
    assert.equal(concurrent.shouldPersist, false);
  });
});
