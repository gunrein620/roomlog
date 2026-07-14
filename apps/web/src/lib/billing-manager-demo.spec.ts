import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEMO_COLLECTION,
  DEMO_DASHBOARD,
  DEMO_DEPOSITS_DATA,
  DEMO_OVERDUE,
  demoManagerBillCreation,
} from "./billing-manager-demo";

describe("manager billing demo fallback data", () => {
  it("provides five rows for each billing management list section", () => {
    assert.equal(DEMO_DASHBOARD.bills.length, 5, "청구 목록은 5건이어야 한다.");
    assert.equal(DEMO_COLLECTION.recentDeposits.length, 5, "최근 입금은 5건이어야 한다.");
    assert.equal(DEMO_DEPOSITS_DATA.paymentReports.length, 5, "납부 신고 큐는 5건이어야 한다.");
    assert.equal(DEMO_DEPOSITS_DATA.deposits.length, 5, "실제 입금 매칭은 5건이어야 한다.");
    assert.equal(DEMO_DEPOSITS_DATA.orphanDeposits.length, 5, "orphan 입금 큐는 5건이어야 한다.");
    assert.equal(DEMO_DEPOSITS_DATA.mismatchDeposits.length, 5, "불일치 확인 요청은 5건이어야 한다.");
    assert.equal(DEMO_OVERDUE.activeCases.length, 5, "연체 세대 목록은 5건이어야 한다.");
    assert.equal(DEMO_OVERDUE.waitingCases.length, 5, "확인 대기 목록은 5건이어야 한다.");
  });

  it("marks bill-creation fallback data as read-only", () => {
    const data = demoManagerBillCreation({ month: "2026-08" });

    assert.equal(data.readOnly, true);
    assert.equal(data.unavailableOptions.length, 0);
  });
});
