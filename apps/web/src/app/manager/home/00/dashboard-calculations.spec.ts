import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  billingRowsForDepositRate,
  buildBriefingInput,
  countDepositPayers,
  depositRateBillingMonth,
  depositRateMonthLabel,
  buildTodayTasks,
  calculateDepositRatePct,
  countOverdueBills,
  rentStatusChipForContract,
  sortTodayTasks,
  type DashboardBillingRow,
  type DashboardContractExpiryRow,
  type DashboardThread,
  type DashboardTicket,
  type TodayTask
} from "./dashboard-calculations";

describe("manager home dashboard calculations", () => {
  it("sorts today tasks by agreed priority", () => {
    const tasks: TodayTask[] = [
      { id: "m1", kind: "unanswered", title: "답장", detail: "", href: "/m", priority: 4 },
      { id: "t1", kind: "urgent_ticket", title: "긴급", detail: "", href: "/t", priority: 2 },
      { id: "b1", kind: "overdue", title: "연체", detail: "", href: "/b", priority: 1 },
      { id: "c1", kind: "expiring", title: "만료", detail: "", href: "/c", priority: 3 }
    ];

    assert.deepEqual(sortTodayTasks(tasks).map((task) => task.kind), [
      "overdue",
      "urgent_ticket",
      "expiring",
      "unanswered"
    ]);
  });

  it("calculates deposit rate as the share of fully-paid payers, not amounts", () => {
    const rows: DashboardBillingRow[] = [
      bill("bill_1", "301", "김민수", 100_000, 100_000, "paid"),
      bill("bill_2", "302", "박서연", 100_000, 20_000, "partially_paid")
    ];

    // 금액 기준이면 60%지만, "낸 사람" 기준으로 2명 중 1명 → 50%.
    assert.equal(calculateDepositRatePct(rows), 50);
    assert.deepEqual(countDepositPayers(rows), { paid: 1, total: 2 });
    assert.equal(calculateDepositRatePct(null), null);
    assert.equal(countDepositPayers(null), null);
  });

  it("scopes deposit rate to the current billing month before summing", () => {
    const rows: DashboardBillingRow[] = [
      bill("bill_1", "301", "김민수", 100_000, 0, "overdue", "2026-06"),
      bill("bill_2", "302", "박서연", 100_000, 70_000, "partially_paid", "2026-07"),
      bill("bill_3", "303", "이하나", 100_000, 100_000, "paid", "2026-08")
    ];

    // 2026-07 스코프엔 부분 납부 1건뿐 → 낸 사람 0/1 = 0%.
    assert.equal(calculateDepositRatePct(rows, "2026-07"), 0);
    assert.deepEqual(billingRowsForDepositRate(rows, "2026-07").map((row) => row.billId), ["bill_2"]);
    assert.deepEqual(billingRowsForDepositRate(rows, "2026-09").map((row) => row.billId), ["bill_3"]);
  });

  it("builds briefing counts without inventing unavailable nullable data", () => {
    const tickets: DashboardTicket[] = [
      ticket("t1", "301", "processing", 1),
      ticket("t2", "302", "reviewing", 3),
      ticket("t3", "303", "resolved", 1)
    ];
    const contracts: DashboardContractExpiryRow[] = [
      contract("c1", "김민수", 12),
      contract("c2", "박서연", 45),
      contract("c3", "이하나", -2)
    ];
    const threads: DashboardThread[] = [
      // unreadCount(세입자 미읽음 배지)가 아니라 마지막 발신자가 판정 기준임을 함께 고정한다.
      thread("m1", "301", 0, "tenant"),
      thread("m2", "302", 3, "manager"),
      thread("m3", "303", 0)
    ];

    assert.deepEqual(
      buildBriefingInput({
        managerName: "홍길동",
        homeCount: 2,
        depositRatePct: null,
        overdueCount: 4,
        tickets,
        contractRows: contracts,
        threads
      }),
      {
        managerName: "홍길동",
        homeCount: 2,
        depositRatePct: null,
        overdueCount: 4,
        urgentTicketCount: 1,
        openTicketCount: 2,
        expiringContractCount: 2,
        unansweredThreadCount: 1
      }
    );
  });

  it("flags threads whose last sender is the tenant as unanswered", () => {
    const threads: DashboardThread[] = [
      // m1: 관리인이 마지막으로 답장(세입자 미읽음 2) → 미응답 아님.
      // m2: 세입자가 마지막 발신 → 미응답.
      thread("m1", "301", 2, "manager"),
      thread("m2", "302", 0, "tenant")
    ];

    const tasks = buildTodayTasks({
      billingRows: [],
      overdueCount: 0,
      tickets: [],
      contractRows: [],
      threads,
      hrefs: {
        billing: "/manager/billing",
        ticket: "/manager/ticket/dash/00",
        contract: "/manager/contract/00",
        messaging: "/manager/messaging/00"
      }
    });

    assert.deepEqual(tasks.map((task) => task.id), ["unanswered:m2"]);
    assert.equal(
      buildBriefingInput({
        managerName: "홍길동",
        homeCount: 0,
        depositRatePct: null,
        overdueCount: 0,
        tickets: [],
        contractRows: [],
        threads
      }).unansweredThreadCount,
      1
    );
  });

  it("keeps overdue counts and task rows aligned", () => {
    const rows: DashboardBillingRow[] = [
      bill("bill_1", "301", "김민수", 100_000, 0, "overdue"),
      bill("bill_2", "302", "박서연", 100_000, 100_000, "paid")
    ];
    const overdueCount = countOverdueBills(rows, 3);
    const tasks = buildTodayTasks({
      billingRows: rows,
      overdueCount,
      tickets: [],
      contractRows: [],
      threads: [],
      hrefs: {
        billing: "/manager/billing",
        ticket: "/manager/ticket/dash/00",
        contract: "/manager/contract/00",
        messaging: "/manager/messaging/00"
      }
    });

    assert.equal(overdueCount, 1);
    assert.deepEqual(tasks.filter((task) => task.kind === "overdue").map((task) => task.id), ["overdue:bill_1"]);

    const summaryOnlyCount = countOverdueBills([], 3);
    const summaryOnlyTasks = buildTodayTasks({
      billingRows: [],
      overdueCount: summaryOnlyCount,
      tickets: [],
      contractRows: [],
      threads: [],
      hrefs: {
        billing: "/manager/billing",
        ticket: "/manager/ticket/dash/00",
        contract: "/manager/contract/00",
        messaging: "/manager/messaging/00"
      }
    });

    assert.equal(summaryOnlyCount, 3);
    assert.deepEqual(summaryOnlyTasks.filter((task) => task.kind === "overdue").map((task) => task.title), [
      "연체 청구 3건 확인"
    ]);
  });

  it("decides rent status chips from matching billing rows", () => {
    const contract = {
      listingTitle: "정글빌라 301호",
      location: "서울시 중구",
      tenantName: "김민수",
      unitId: "301"
    };

    assert.equal(rentStatusChipForContract(contract, [bill("b1", "301", "김민수", 100_000, 100_000, "paid")]), "입금완료");
    assert.equal(rentStatusChipForContract(contract, [bill("b2", "301", "김민수", 100_000, 10_000, "overdue")]), "연체");
    assert.equal(rentStatusChipForContract(contract, [bill("b3", "301", "김민수", 100_000, 0, "sent")]), "대기");
    assert.equal(rentStatusChipForContract(contract, []), "확인불가");
    assert.equal(rentStatusChipForContract(contract, null), "확인불가");
  });
});

function bill(
  billId: string,
  unitId: string,
  tenantName: string,
  totalAmount: number,
  paidAmount: number,
  status: string,
  billingMonth = "2026-07"
): DashboardBillingRow {
  return {
    billId,
    unitId,
    tenantName,
    billingMonth,
    totalAmount,
    paidAmount,
    status,
    dueDate: "2026-07-10"
  };
}

function ticket(id: string, unitId: string, status: string, urgency: number): DashboardTicket {
  return {
    id,
    title: `${unitId}호 하자`,
    unitId,
    status,
    statusLabel: status,
    urgency
  };
}

function contract(id: string, tenantName: string, daysToExpire: number): DashboardContractExpiryRow {
  return {
    id,
    tenantName,
    buildingName: "정글빌라",
    unitId: "301",
    daysToExpire
  };
}

function thread(
  id: string,
  unitId: string,
  unreadCount: number,
  lastMessageSender?: "tenant" | "manager"
): DashboardThread {
  return {
    id,
    unitId,
    lastMessage: "메시지",
    lastMessageSender,
    updatedAt: "2026-07-01T11:00:00+09:00",
    unreadCount
  };
}

describe("depositRateMonthLabel", () => {
  it("당월 청구가 있으면 '이번 달'", () => {
    const rows = [bill("b1", "301", "김민수", 100, 50, "sent", "2026-07")];
    assert.equal(depositRateMonthLabel(rows, "2026-07"), "이번 달");
  });

  it("당월 청구가 없으면 최근 청구월을 라벨에 드러낸다", () => {
    const rows = [
      bill("b1", "301", "김민수", 100, 50, "sent", "2026-05"),
      bill("b2", "302", "박서연", 100, 100, "paid", "2026-06")
    ];
    assert.equal(depositRateBillingMonth(rows, "2026-07"), "2026-06");
    assert.equal(depositRateMonthLabel(rows, "2026-07"), "6월(최근 청구월)");
  });

  it("청구 데이터가 없으면 '이번 달'로 둔다", () => {
    assert.equal(depositRateMonthLabel(null, "2026-07"), "이번 달");
    assert.equal(depositRateMonthLabel([], "2026-07"), "이번 달");
  });
});
