import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveManagerDunningTargets } from "./manager-dunning-target-resolver";

const candidates = [
  {
    id: "bill-102",
    buildingName: "플로우테스트2",
    unitId: "102",
    tenantName: "세입자2",
    billingMonth: "2026-07",
    daysOverdue: 19
  },
  {
    id: "bill-103",
    buildingName: "플로우테스트3",
    unitId: "103",
    tenantName: "세입자3",
    billingMonth: "2026-07",
    daysOverdue: 0
  }
];

describe("manager dunning target resolver", () => {
  it("selects every eligible bill for an explicit all request", () => {
    const result = resolveManagerDunningTargets(
      "두 개 전부 다 독촉 문자 보내줘",
      candidates
    );

    assert.deepEqual(result, {
      status: "resolved",
      candidates
    });
  });

  it("keeps a unit-specific request singular", () => {
    const result = resolveManagerDunningTargets(
      "103호 독촉 문자 보내줘",
      candidates
    );

    assert.deepEqual(result, {
      status: "resolved",
      candidates: [candidates[1]]
    });
  });

  it("does not guess when a generic singular request has multiple matches", () => {
    const result = resolveManagerDunningTargets("독촉 문자 보내줘", candidates);

    assert.deepEqual(result, {
      status: "ambiguous",
      candidates
    });
  });
});
