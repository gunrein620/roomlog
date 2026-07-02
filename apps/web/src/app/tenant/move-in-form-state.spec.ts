import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { initialMoveInChecklistForm } from "./move-in-form-state";

describe("tenant move-in checklist form state", () => {
  it("starts without mock room-condition values", () => {
    assert.deepEqual(initialMoveInChecklistForm(), {
      area: "",
      itemName: "",
      memo: ""
    });
  });
});
