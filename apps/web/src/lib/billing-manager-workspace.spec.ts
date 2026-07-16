import assert from "node:assert/strict";
import test from "node:test";
import type { ManagerBillRow, ManagerCollectionPoint, OverdueCase } from "@roomlog/types";
import {
  billingMonthDayCount,
  collectionPerformanceRows,
  filterOverdueCases,
  filterDashboardBills,
  formatBillingDate,
  formatTransactionDateTime,
  managerAgentOverdueHref,
  managerBillDisplayState,
  managerBillStatusLabel,
  overdueStageLabel,
  sortOverdueCases,
  timingAxisLabel,
  transactionLedgerStatusLabel,
} from "./billing-manager-workspace";

const collectionPoint = (
  billingMonth: string,
  collectionRate: number,
): ManagerCollectionPoint => ({
  billingMonth,
  billedAmount: 1_000_000,
  collectedAmount: Math.round(1_000_000 * collectionRate),
  unpaidAmount: Math.round(1_000_000 * (1 - collectionRate)),
  collectionRate,
  billedUnits: 2,
  fullyPaidUnits: 1,
  partiallyPaidUnits: 1,
});

const guardedBill: ManagerBillRow = {
  billId: "bill-301-2026-07",
  buildingName: "정글빌라",
  unitId: "301",
  tenantName: "정겸직",
  billingMonth: "2026-07",
  totalAmount: 720000,
  paidAmount: 0,
  unpaidAmount: 720000,
  daysOverdue: 2,
  status: "sent",
  dueDate: "2026-07-12T23:59:59+09:00",
  guard: { blocked: true, hasConfirming: false, hasOrphan: true },
};

test("manager billing labels a past-due guarded bill as unmatched-deposit review instead of awaiting payment", () => {
  assert.equal(managerBillDisplayState(guardedBill), "payment_review");
  assert.equal(managerBillStatusLabel(guardedBill), "미연결 입금 확인 대기");
  assert.deepEqual(
    filterDashboardBills([guardedBill], { status: "payment_review" }).map((bill) => bill.billId),
    [guardedBill.billId],
  );
  assert.equal(filterDashboardBills([guardedBill], { status: "sent" }).length, 0);
});

test("manager billing keeps normal awaiting-payment and active-overdue labels", () => {
  const awaiting = { ...guardedBill, daysOverdue: 0, guard: { blocked: false, hasConfirming: false, hasOrphan: false } };
  const overdue = { ...guardedBill, status: "overdue" as const, guard: { blocked: false, hasConfirming: false, hasOrphan: false } };

  assert.equal(managerBillStatusLabel(awaiting), "수납 대기");
  assert.equal(managerBillStatusLabel(overdue), "연체");
});

test("overdue AI entry preserves the exact bill and asks for a confirmation-gated dunning draft", () => {
  const item: OverdueCase = {
    ...guardedBill,
    unpaidAmount: 720000,
    daysOverdue: 2,
    stage: "minor",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  };
  const href = managerAgentOverdueHref(item);
  const url = new URL(href, "https://roomlog.test");

  assert.equal(url.pathname, "/manager/agent/realtime");
  assert.equal(url.searchParams.get("billId"), item.billId);
  assert.match(url.searchParams.get("prompt") ?? "", /연체 독촉 문구를 준비해줘/);
  assert.match(url.searchParams.get("prompt") ?? "", /발송 전에는 반드시 나에게 확인/);
});

test("overdue cases use factual stages and deterministic sorts", () => {
  assert.equal(overdueStageLabel(0), "7일 이내");
  assert.equal(overdueStageLabel(7), "7일 이내");
  assert.equal(overdueStageLabel(8), "8~30일");
  assert.equal(overdueStageLabel(30), "8~30일");
  assert.equal(overdueStageLabel(31), "31일 이상");

  const baseCase: OverdueCase = {
    ...guardedBill,
    unpaidAmount: 720000,
    daysOverdue: 2,
    stage: "minor",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  };
  const cases = [
    { ...baseCase, billId: "due-now", daysOverdue: 0, unpaidAmount: 100000 },
    { ...baseCase, billId: "day-seven", daysOverdue: 7, unpaidAmount: 200000 },
    { ...baseCase, billId: "short", daysOverdue: 3, unpaidAmount: 900000 },
    { ...baseCase, billId: "long", daysOverdue: 40, unpaidAmount: 300000 },
  ];

  assert.deepEqual(
    filterOverdueCases(cases, "1_7").map((item) => item.billId),
    ["due-now", "day-seven", "short"],
  );

  assert.deepEqual(
    sortOverdueCases(cases, "days_desc").map((item) => item.billId),
    ["long", "day-seven", "short", "due-now"],
  );
  assert.deepEqual(
    sortOverdueCases(cases, "unpaid_desc").map((item) => item.billId),
    ["short", "long", "day-seven", "due-now"],
  );
});

test("collection performance defaults to recent-first without changing chronological deltas", () => {
  const points = [
    collectionPoint("2026-03", 0.8),
    collectionPoint("2026-01", 0.5),
    collectionPoint("2026-02", 0.7),
  ];

  const recentFirst = collectionPerformanceRows(points, "desc");
  assert.deepEqual(
    recentFirst.map((row) => row.billingMonth),
    ["2026-03", "2026-02", "2026-01"],
  );
  assert.equal(recentFirst[0]?.rateDelta?.toFixed(1), "0.1");
  assert.equal(recentFirst[1]?.rateDelta?.toFixed(1), "0.2");
  assert.equal(recentFirst[2]?.rateDelta, undefined);

  assert.deepEqual(
    collectionPerformanceRows(points, "asc").map((row) => row.billingMonth),
    ["2026-01", "2026-02", "2026-03"],
  );
});

test("billing deadline uses a Seoul date without exposing the ISO time", () => {
  assert.equal(formatBillingDate("2026-07-10T14:59:59.000Z"), "2026. 7. 10.");
  assert.equal(formatBillingDate("not-a-date"), "정보 없음");
});

test("transaction detail distinguishes this deposit from cumulative collection", () => {
  const bill = {
    status: "partially_paid" as const,
    totalAmount: 720_000,
    paidAmount: 320_000,
  };

  assert.equal(
    transactionLedgerStatusLabel({ linkedBillRelation: "matched", linkedBill: bill }),
    "부분 수납",
  );
  assert.equal(
    transactionLedgerStatusLabel({
      linkedBillRelation: "matched",
      linkedBill: { ...bill, status: "paid", paidAmount: 720_000 },
    }),
    "완납",
  );
  assert.equal(
    transactionLedgerStatusLabel({ linkedBillRelation: "candidate", linkedBill: bill }),
    "연결 확인 필요",
  );
  assert.equal(formatTransactionDateTime("2026-07-09T00:30:00.000Z"), "2026. 7. 9. 09:30");
  assert.equal(formatTransactionDateTime("not-a-date"), "정보 없음");
});

test("collection timing uses the selected month length and daily ticks", () => {
  assert.equal(billingMonthDayCount("2026-02"), 28);
  assert.equal(billingMonthDayCount("2028-02"), 29);
  assert.equal(billingMonthDayCount("2026-04"), 30);
  assert.equal(billingMonthDayCount("2026-07"), 31);
  assert.equal(billingMonthDayCount("invalid"), 31);

  assert.equal(timingAxisLabel(1, 31), "1");
  assert.equal(timingAxisLabel(2, 31), "");
  assert.equal(timingAxisLabel(5, 31), "5");
  assert.equal(timingAxisLabel(28, 28), "28");
  assert.equal(timingAxisLabel(31, 31), "31");
});
