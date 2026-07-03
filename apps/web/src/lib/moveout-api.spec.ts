import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tenantMoveoutPaths } from "./moveout-api";
import { managerMoveoutPaths } from "./moveout-manager-api";

describe("moveout api path contracts", () => {
  it("routes tenant moveout reads and mutations through the real roomlog API", () => {
    assert.equal(tenantMoveoutPaths.moveouts(), "/moveouts");
    assert.equal(tenantMoveoutPaths.moveout("mo 1"), "/moveouts/mo%201");
    assert.equal(tenantMoveoutPaths.records("mo 1"), "/moveouts/mo%201/records");
    assert.equal(tenantMoveoutPaths.checklist("mo 1"), "/moveouts/mo%201/checklist");
    assert.equal(tenantMoveoutPaths.settlement("mo 1"), "/moveouts/mo%201/settlement");
    assert.equal(tenantMoveoutPaths.disputes("mo 1"), "/moveouts/mo%201/disputes");
    assert.equal(tenantMoveoutPaths.inquiries("mo 1"), "/moveouts/mo%201/inquiries");
  });

  it("routes manager moveout reads and mutations through manager-scoped API paths", () => {
    assert.equal(managerMoveoutPaths.dashboard(), "/moveouts/manager/dashboard");
    assert.equal(managerMoveoutPaths.rows(), "/moveouts/manager/rows");
    assert.equal(managerMoveoutPaths.settlement("mo 1"), "/moveouts/mo%201/manager-settlement");
    assert.equal(managerMoveoutPaths.reportAudit("mo 1"), "/moveouts/mo%201/report-audit");
    assert.equal(managerMoveoutPaths.adjustWearVerdict("mo 1"), "/moveouts/mo%201/records/wear-verdict");
    assert.equal(managerMoveoutPaths.adjustDeduction("mo 1"), "/moveouts/mo%201/deductions");
    assert.equal(managerMoveoutPaths.completeReview("mo 1"), "/moveouts/mo%201/complete-review");
    assert.equal(managerMoveoutPaths.respondDispute("mo 1"), "/moveouts/mo%201/disputes/respond");
  });
});
