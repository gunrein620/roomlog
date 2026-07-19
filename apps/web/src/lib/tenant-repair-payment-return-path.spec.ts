import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { normalizeTenantRepairPaymentReturnPath } from "./tenant-repair-payment-return-path";

describe("tenant repair payment return path", () => {
  it("preserves the exact living complaint return path", () => {
    assert.equal(
      normalizeTenantRepairPaymentReturnPath(
        "/living?complaintId=complaint-1&repairPayment=approved#detail",
      ),
      "/living?complaintId=complaint-1#detail",
    );
  });

  it("keeps the legacy standalone checkout return path", () => {
    assert.equal(
      normalizeTenantRepairPaymentReturnPath(
        "/tenant/repair-payment/payment-1?complaintId=complaint-1",
      ),
      "/tenant/repair-payment/payment-1?complaintId=complaint-1",
    );
  });

  it("rejects external and lookalike living paths", () => {
    for (const value of [
      "https://evil.example/living?complaintId=complaint-1",
      "//evil.example/living?complaintId=complaint-1",
      "/living/another?complaintId=complaint-1",
      "/living-malicious?complaintId=complaint-1",
    ]) {
      assert.equal(normalizeTenantRepairPaymentReturnPath(value), "/living");
    }
  });
});
