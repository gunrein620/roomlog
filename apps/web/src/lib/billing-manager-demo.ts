import type {
  Bill,
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  ManagerBillRow,
  OverdueCase,
} from "@roomlog/types";
import type { ManagerPaymentReportRow } from "./billing-manager-mapping";

export interface ManagerDashboardData {
  summary: BillDashboardSummary;
  bills: ManagerBillRow[];
}

export interface ManagerDepositsData {
  paymentReports: ManagerPaymentReportRow[];
  deposits: Deposit[];
  orphanDeposits: Deposit[];
  mismatchDeposits: Deposit[];
}

export interface ManagerOverdueData {
  activeCases: OverdueCase[];
  waitingCases: OverdueCase[];
}

const DEMO_ACCOUNT = {
  bankName: "하나은행",
  accountNumber: "123-456789-0000",
  accountHolder: "룸로그관리",
};

const paymentReportRows: ManagerPaymentReportRow[] = [
  ["301", "김민수", 720000],
  ["302", "김하윤", 732000],
  ["303", "이준서", 744000],
  ["304", "박서연", 756000],
  ["305", "최민재", 768000],
].map(([unitId, tenantName, totalAmount]) => ({
  billId: `bill-demo-report-${unitId}`,
  reportId: `report-demo-${unitId}`,
  unitId: String(unitId),
  tenantName: String(tenantName),
  billingMonth: "2026-07",
  totalAmount: Number(totalAmount),
  paidAmount: 0,
  status: "confirming",
  dueDate: "2026-07-10",
  badge: "confirming",
}));

export const DEMO_BILLS: ManagerBillRow[] = [
  {
    billId: "bill-2026-07-302",
    unitId: "302",
    tenantName: "김하윤",
    billingMonth: "2026-07",
    totalAmount: 680000,
    paidAmount: 0,
    status: "confirming",
    dueDate: "2026-07-10",
    badge: "confirming",
  },
  {
    billId: "bill-2026-07-401",
    unitId: "401",
    tenantName: "이준서",
    billingMonth: "2026-07",
    totalAmount: 720000,
    paidAmount: 0,
    status: "overdue",
    dueDate: "2026-06-25",
    badge: "overdue",
  },
  {
    billId: "bill-2026-07-205",
    unitId: "205",
    tenantName: "박서연",
    billingMonth: "2026-07",
    totalAmount: 635000,
    paidAmount: 300000,
    status: "partially_paid",
    dueDate: "2026-07-10",
    badge: "partial",
  },
  {
    billId: "bill-2026-07-501",
    unitId: "501",
    tenantName: "최민재",
    billingMonth: "2026-07",
    totalAmount: 705000,
    paidAmount: 705000,
    status: "paid",
    dueDate: "2026-07-10",
    badge: "paid",
  },
  {
    billId: "bill-2026-08-draft",
    unitId: "전체",
    tenantName: "8월 정기 청구",
    billingMonth: "2026-08",
    totalAmount: 0,
    paidAmount: 0,
    status: "draft",
    dueDate: "2026-08-10",
    badge: "none",
  },
];

export const DEMO_PAYMENT_REPORTS: ManagerPaymentReportRow[] = paymentReportRows;

export const DEMO_DEPOSITS: Deposit[] = [
  {
    id: "dep-match-301",
    depositorName: "김민수",
    amount: 720000,
    depositedAt: "2026-07-05T09:24:00+09:00",
    matchStatus: "unmatched",
    guessedUnitId: "301",
  },
  {
    id: "dep-match-302",
    depositorName: "김하윤",
    amount: 320000,
    depositedAt: "2026-07-04T10:11:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-2026-07-302",
  },
  {
    id: "dep-match-303",
    depositorName: "이준서",
    amount: 744000,
    depositedAt: "2026-07-03T11:03:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-demo-report-303",
  },
  {
    id: "dep-match-304",
    depositorName: "박서연",
    amount: 756000,
    depositedAt: "2026-07-02T17:42:00+09:00",
    matchStatus: "unmatched",
    guessedUnitId: "304",
  },
  {
    id: "dep-match-305",
    depositorName: "최민재",
    amount: 768000,
    depositedAt: "2026-07-01T12:08:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-demo-report-305",
  },
  {
    id: "dep-orphan-601",
    depositorName: "김미숙",
    amount: 720000,
    depositedAt: "2026-06-30T09:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "601",
  },
  {
    id: "dep-orphan-602",
    depositorName: "홍길동",
    amount: 732000,
    depositedAt: "2026-06-29T10:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "602",
  },
  {
    id: "dep-orphan-603",
    depositorName: "윤세아",
    amount: 744000,
    depositedAt: "2026-06-28T11:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "603",
  },
  {
    id: "dep-orphan-604",
    depositorName: "문태오",
    amount: 756000,
    depositedAt: "2026-06-27T12:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "604",
  },
  {
    id: "dep-orphan-605",
    depositorName: "배수진",
    amount: 768000,
    depositedAt: "2026-06-26T13:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "605",
  },
  {
    id: "dep-mismatch-301",
    depositorName: "김민수",
    amount: 690000,
    depositedAt: "2026-06-25T09:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-301",
    guessedUnitId: "301",
  },
  {
    id: "dep-mismatch-302",
    depositorName: "김하윤",
    amount: 702000,
    depositedAt: "2026-06-24T10:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-302",
    guessedUnitId: "302",
  },
  {
    id: "dep-mismatch-303",
    depositorName: "이준서",
    amount: 714000,
    depositedAt: "2026-06-23T11:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-303",
    guessedUnitId: "303",
  },
  {
    id: "dep-mismatch-304",
    depositorName: "박서연",
    amount: 726000,
    depositedAt: "2026-06-22T12:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-304",
    guessedUnitId: "304",
  },
  {
    id: "dep-mismatch-305",
    depositorName: "최민재",
    amount: 738000,
    depositedAt: "2026-06-21T13:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-305",
    guessedUnitId: "305",
  },
];

export const DEMO_DASHBOARD: ManagerDashboardData = {
  summary: {
    total: DEMO_BILLS.length,
    confirmNeeded: 5,
    pending: 2,
    overdue: 1,
  },
  bills: DEMO_BILLS,
};

function demoBillFromRow(row: ManagerBillRow): Bill {
  const maintenanceAmount = row.totalAmount > 0 ? Math.min(70000, row.totalAmount) : 0;
  const rentAmount = Math.max(row.totalAmount - maintenanceAmount, 0);
  return {
    id: row.billId,
    unitId: row.unitId,
    billingMonth: row.billingMonth,
    status: row.status,
    items: [
      { label: "월 임대료", amount: rentAmount },
      { label: "관리비", amount: maintenanceAmount },
    ].filter((item) => item.amount > 0),
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    dueDate: row.dueDate,
    account: DEMO_ACCOUNT,
    createdAt: `${row.billingMonth}-01T09:00:00+09:00`,
    updatedAt: `${row.billingMonth}-01T09:00:00+09:00`,
  };
}

export const DEMO_MANAGER_BILLS: Bill[] = [...DEMO_BILLS, ...DEMO_PAYMENT_REPORTS].map(demoBillFromRow);

export const DEMO_NEW_BILL: Bill = {
  id: "new",
  unitId: "전체",
  billingMonth: "2026-08",
  status: "draft",
  items: [
    { label: "월 임대료", amount: 650000 },
    { label: "관리비", amount: 70000 },
  ],
  totalAmount: 720000,
  paidAmount: 0,
  dueDate: "2026-08-10",
  account: DEMO_ACCOUNT,
  createdAt: "2026-08-01T09:00:00+09:00",
  updatedAt: "2026-08-01T09:00:00+09:00",
};

export const DEMO_COLLECTION: CollectionSummary = {
  billingMonth: "2026-07",
  collectionRate: 0.47,
  collectedAmount: 1005000,
  unpaidAmount: 2035000,
  vacancyLoss: 350000,
  confirmingAmount: DEMO_PAYMENT_REPORTS.reduce((sum, bill) => sum + bill.totalAmount, 0),
  orphanAmount: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "orphan").reduce(
    (sum, deposit) => sum + deposit.amount,
    0
  ),
  recentDeposits: DEMO_DEPOSITS.slice(0, 5),
};

export const DEMO_DEPOSITS_DATA: ManagerDepositsData = {
  paymentReports: DEMO_PAYMENT_REPORTS,
  deposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "unmatched" || deposit.matchStatus === "matched"),
  orphanDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "orphan"),
  mismatchDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "mismatch"),
};

const overdueNames = ["정예린", "한도윤", "오지후", "서민지", "유현우"];

export const DEMO_OVERDUE: ManagerOverdueData = {
  activeCases: overdueNames.map((tenantName, index) => ({
    billId: `bill-demo-overdue-${411 + index}`,
    unitId: String(411 + index),
    tenantName,
    unpaidAmount: 770000 + index * 12000,
    daysOverdue: 7 + index * 3,
    stage: index >= 3 ? "severe" : index >= 1 ? "warning" : "minor",
    dueDate: `2026-06-${25 - index}`,
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  })),
  waitingCases: DEMO_PAYMENT_REPORTS.map((bill, index) => ({
    billId: bill.billId,
    unitId: bill.unitId,
    tenantName: bill.tenantName,
    unpaidAmount: bill.totalAmount - bill.paidAmount,
    daysOverdue: 2 + index,
    stage: index >= 3 ? "warning" : "minor",
    dueDate: "2026-06-30",
    guard: { blocked: true, hasConfirming: true, hasOrphan: false },
  })),
};

export const DEMO_DUNNING: DunningDraft = {
  billId: "bill-demo-overdue-411",
  unitId: "411",
  tenantName: "정예린",
  unpaidAmount: 770000,
  draftText:
    "안녕하세요. 411호 2026년 7월 청구 중 미납 잔액이 확인되어 안내드립니다. 이미 이체하셨거나 입금자명이 다른 경우 확인을 도와드리겠습니다. 납부가 어려우시면 분할 또는 일정 상담을 요청해 주세요.",
  channel: "룸로그 알림",
  guard: { blocked: false, hasConfirming: false, hasOrphan: false },
};

export const DEMO_MANAGER_BILL_ID = "bill-demo-overdue-411";

export function demoBillFallback(billId?: string): Bill {
  if (billId === "new") return DEMO_NEW_BILL;
  return (
    DEMO_MANAGER_BILLS.find((bill) => bill.id === billId) ??
    DEMO_MANAGER_BILLS.find((bill) => bill.id === DEMO_MANAGER_BILL_ID) ??
    DEMO_MANAGER_BILLS[0] ??
    DEMO_NEW_BILL
  );
}
