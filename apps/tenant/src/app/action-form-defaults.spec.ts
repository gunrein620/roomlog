import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  initialTenantAiFeedbackAction,
  initialTenantAiFeedbackReason,
  initialTenantReopenText
} from "./action-form-state";

describe("tenant action form defaults", () => {
  it("does not prefill dispute or reopen forms with mock incident text", () => {
    assert.equal(initialTenantReopenText(), "");
    assert.equal(initialTenantAiFeedbackReason(), "");
    assert.equal(initialTenantAiFeedbackAction(), "");
  });
});
