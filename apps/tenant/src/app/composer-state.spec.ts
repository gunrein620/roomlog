import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { initialConsultationComposerText } from "./composer-state";

describe("tenant consultation composer state", () => {
  it("starts empty instead of prefilled with a mock complaint", () => {
    assert.equal(initialConsultationComposerText(), "");
  });
});
