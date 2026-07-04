import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tenantMoveoutPaths } from "./moveout-api";
import {
  DEMO_MANAGER_MOVEOUT_ROWS,
  DEMO_MANAGER_SETTLEMENT_REVIEW,
  managerMoveoutPaths,
} from "./moveout-manager-api";
import {
  DEMO_MOVEOUT,
  DEMO_MOVEOUT_DISPUTES,
  DEMO_MOVEOUT_RECORDS,
  DEMO_MOVEOUT_SETTLEMENT,
} from "./demo-moveout";

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

  it("keeps the tenant and manager fallback data aligned with the KAN-134 demo seed", () => {
    const firstManagerRow = DEMO_MANAGER_MOVEOUT_ROWS[0];
    const firstDispute = DEMO_MOVEOUT_DISPUTES[0];
    const deductionById = new Map(
      DEMO_MOVEOUT_SETTLEMENT.deductions.map((deduction) => [deduction.id, deduction]),
    );

    assert.equal(DEMO_MOVEOUT.id, "mo_0001");
    assert.equal(DEMO_MOVEOUT.unitId, "302");
    assert.equal(DEMO_MOVEOUT.settlementStatus, "reviewing");
    assert.equal(DEMO_MOVEOUT.prepProgress, 0.72);
    assert.equal(DEMO_MOVEOUT_RECORDS.length, 6);
    assert.equal(DEMO_MOVEOUT_SETTLEMENT.status, "reviewing");
    assert.equal(DEMO_MOVEOUT_SETTLEMENT.refundMin, 9_740_000);
    assert.equal(DEMO_MOVEOUT_SETTLEMENT.refundMax, 9_850_000);
    assert.equal(DEMO_MOVEOUT_SETTLEMENT.deductions.length, 4);
    assert.equal(deductionById.get("de_0001")?.estimatedMin, 70_000);
    assert.equal(deductionById.get("de_0002")?.needsConfirmation, false);
    assert.equal(deductionById.get("de_0003")?.needsConfirmation, false);
    assert.equal(firstDispute.status, "received");
    assert.equal(firstDispute.slaBreached, true);

    assert.equal(firstManagerRow.summaryId, "mo_0001");
    assert.equal(firstManagerRow.tenantName, "김민수");
    assert.equal(firstManagerRow.slaBreached, true);
    assert.deepEqual(DEMO_MANAGER_SETTLEMENT_REVIEW.gate.blockingReasons, ["unresolved_dispute"]);
    assert.equal(DEMO_MANAGER_SETTLEMENT_REVIEW.gate.overrideAvailable, true);
  });
});
