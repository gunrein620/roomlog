import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tenantMoveoutPaths } from "./moveout-api";
import {
  DEMO_MANAGER_MOVEOUT_ROWS,
  DEMO_MANAGER_SETTLEMENT_REVIEW,
  adjustDeduction,
  adjustWearVerdict,
  completeReview,
  managerMoveoutPaths,
} from "./moveout-manager-api";
import { MANAGER_MOVEOUT_ROUTES, withManagerMoveoutId } from "./moveout-manager-nav";
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
    assert.equal(tenantMoveoutPaths.updateChecklist("mo 1"), "/moveouts/mo%201/checklist");
    assert.equal(tenantMoveoutPaths.settlement("mo 1"), "/moveouts/mo%201/settlement");
    assert.equal(tenantMoveoutPaths.disputes("mo 1"), "/moveouts/mo%201/disputes");
    assert.equal(tenantMoveoutPaths.disputeAction("mo 1"), "/moveouts/mo%201/disputes/action");
    assert.equal(tenantMoveoutPaths.disputeEscalation("mo 1"), "/moveouts/mo%201/disputes/escalate");
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

  it("keeps the selected manager moveout id across M-OUT tabs", () => {
    assert.equal(
      withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-02"], "mo 1"),
      "/manager/moveout/02?id=mo%201",
    );
    assert.equal(
      withManagerMoveoutId(`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?selectedDisputeId=dp-a`, "mo 1"),
      "/manager/moveout/03?selectedDisputeId=dp-a&id=mo%201",
    );
    assert.equal(withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-01"]), MANAGER_MOVEOUT_ROUTES["M-OUT-01"]);
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

  it("provides detailed fallback sections for every moveout record card", () => {
    const recordsWithDetails = DEMO_MOVEOUT_RECORDS.filter(
      (record) => Array.isArray((record as any).detailSections) && (record as any).detailSections.length > 0,
    );
    const bathroomRepair = DEMO_MOVEOUT_RECORDS.find((record) => record.id === "rec_0003") as any;

    assert.equal(recordsWithDetails.length, DEMO_MOVEOUT_RECORDS.length);
    assert.deepEqual(
      bathroomRepair.detailSections.map((section: any) => section.label),
      ["원천 기록", "정산 영향", "다음 행동"],
    );
    assert.ok(
      bathroomRepair.detailSections.some((section: any) =>
        section.items.some((item: any) => item.value.includes("최종 차감 확정 아님")),
      ),
    );
  });

  it("uses public demo files for moveout evidence links", () => {
    const evidenceUrls = DEMO_MOVEOUT_RECORDS.flatMap((record) => record.evidenceUrls ?? []);

    assert.ok(evidenceUrls.length > 0);
    for (const url of evidenceUrls) {
      assert.match(url, /^\/demo\/moveout\/.+\.svg$/);
      assert.equal(existsSync(join(process.cwd(), "public", url)), true);
    }
  });

  it("falls back to demo manager mutation results when the API is unavailable", async () => {
    const warn = console.warn;
    console.warn = () => {};

    try {
      const wearResult = await adjustWearVerdict("mo_0001", {
        recordItemId: "rec_0003",
        action: "reinforce",
        evidenceNote: "데모 근거 보강",
        notifyTenant: true,
      });
      const deductionResult = await adjustDeduction("mo_0001", {
        deductionId: "de_0002",
        estimatedMin: 30_000,
        estimatedMax: 80_000,
        resolveConfirmation: true,
        note: "데모 금액 조정",
      });
      const reviewResult = await completeReview("mo_0001", {
        acknowledgeEvidence: true,
        overrideSla: true,
        overrideReason: "데모 검토 완료",
      });

      assert.equal(wearResult.record.id, "rec_0003");
      assert.equal(wearResult.audit.evidenceNote, "데모 근거 보강");
      assert.equal(deductionResult.id, DEMO_MOVEOUT_SETTLEMENT.id);
      assert.equal(reviewResult.settlement.id, DEMO_MANAGER_SETTLEMENT_REVIEW.settlement.id);
    } finally {
      console.warn = warn;
    }
  });
});
