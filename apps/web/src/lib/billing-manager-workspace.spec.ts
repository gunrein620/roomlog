import assert from "node:assert/strict";
import test from "node:test";
import type { ManagerBillRow, OverdueCase } from "@roomlog/types";
import {
  filterDashboardBills,
  managerAgentOverdueHref,
  managerBillDisplayState,
  managerBillStatusLabel,
} from "./billing-manager-workspace";

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
