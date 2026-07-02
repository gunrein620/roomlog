import type {
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  ManagerBillRow,
  OverdueCase,
} from "@roomlog/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface ManagerDashboardData {
  summary: BillDashboardSummary;
  bills: ManagerBillRow[];
}

export interface ManagerDepositsData {
  paymentReports: ManagerBillRow[];
  deposits: Deposit[];
  orphanDeposits: Deposit[];
  mismatchDeposits: Deposit[];
}

export interface ManagerOverdueData {
  activeCases: OverdueCase[];
  waitingCases: OverdueCase[];
}

const DEMO_BILLS: ManagerBillRow[] = [
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

const DEMO_DEPOSITS: Deposit[] = [
  {
    id: "dep-001",
    depositorName: "김하윤",
    amount: 680000,
    depositedAt: "2026-07-02T09:24:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-2026-07-302",
  },
  {
    id: "dep-002",
    depositorName: "김영수",
    amount: 720000,
    depositedAt: "2026-07-01T20:11:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "401",
  },
  {
    id: "dep-003",
    depositorName: "최민재",
    amount: 705000,
    depositedAt: "2026-07-01T11:03:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-2026-07-501",
  },
  {
    id: "dep-004",
    depositorName: "박서연",
    amount: 300000,
    depositedAt: "2026-06-30T17:42:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-2026-07-205",
  },
];

const DEMO_DASHBOARD: ManagerDashboardData = {
  summary: {
    total: DEMO_BILLS.length,
    confirmNeeded: 3,
    pending: 2,
    overdue: 1,
  },
  bills: DEMO_BILLS,
};

const DEMO_COLLECTION: CollectionSummary = {
  billingMonth: "2026-07",
  collectionRate: 0.47,
  collectedAmount: 1005000,
  unpaidAmount: 2035000,
  vacancyLoss: 350000,
  confirmingAmount: 680000,
  orphanAmount: 720000,
  recentDeposits: DEMO_DEPOSITS,
};

const DEMO_DEPOSITS_DATA: ManagerDepositsData = {
  paymentReports: DEMO_BILLS.filter((bill) => bill.status === "confirming"),
  deposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "unmatched" || deposit.matchStatus === "matched"),
  orphanDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "orphan"),
  mismatchDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "mismatch"),
};

const DEMO_OVERDUE: ManagerOverdueData = {
  activeCases: [
    {
      billId: "bill-2026-07-401",
      unitId: "401",
      tenantName: "이준서",
      unpaidAmount: 720000,
      daysOverdue: 7,
      stage: "warning",
      dueDate: "2026-06-25",
      guard: { blocked: false, hasConfirming: false, hasOrphan: false },
    },
  ],
  waitingCases: [
    {
      billId: "bill-2026-07-302",
      unitId: "302",
      tenantName: "김하윤",
      unpaidAmount: 680000,
      daysOverdue: 2,
      stage: "minor",
      dueDate: "2026-06-30",
      guard: { blocked: true, hasConfirming: true, hasOrphan: false },
    },
    {
      billId: "bill-2026-07-401-orphan",
      unitId: "401",
      tenantName: "이준서",
      unpaidAmount: 720000,
      daysOverdue: 7,
      stage: "warning",
      dueDate: "2026-06-25",
      guard: { blocked: true, hasConfirming: false, hasOrphan: true },
    },
  ],
};

const DEMO_DUNNING: DunningDraft = {
  billId: "bill-2026-07-401",
  unitId: "401",
  tenantName: "이준서",
  unpaidAmount: 720000,
  draftText:
    "안녕하세요. 401호 2026년 7월 청구 중 미납 잔액이 확인되어 안내드립니다. 이미 이체하셨거나 입금자명이 다른 경우 확인을 도와드리겠습니다. 납부가 어려우시면 분할 또는 일정 상담을 요청해 주세요.",
  channel: "룸로그 알림",
  guard: { blocked: false, hasConfirming: false, hasOrphan: false },
};

export const DEMO_MANAGER_BILL_ID = "bill-2026-07-401";

export function getManagerDashboard(): Promise<ManagerDashboardData> {
  return tryFetch("/bills/manager/dashboard", DEMO_DASHBOARD);
}

export function getManagerCollection(): Promise<CollectionSummary> {
  return tryFetch("/bills/manager/collection", DEMO_COLLECTION);
}

export function getManagerDeposits(): Promise<ManagerDepositsData> {
  return tryFetch("/bills/manager/deposits", DEMO_DEPOSITS_DATA);
}

export function getManagerOverdue(): Promise<ManagerOverdueData> {
  return tryFetch("/bills/manager/overdue", DEMO_OVERDUE);
}

export function getManagerDunning(billId: string): Promise<DunningDraft> {
  const fallback =
    billId.includes("302") || billId.includes("orphan")
      ? {
          ...DEMO_DUNNING,
          billId,
          unitId: billId.includes("302") ? "302" : "401",
          tenantName: billId.includes("302") ? "김하윤" : "이준서",
          guard: {
            blocked: true,
            hasConfirming: billId.includes("302"),
            hasOrphan: !billId.includes("302"),
          },
        }
      : { ...DEMO_DUNNING, billId };

  return tryFetch(`/bills/manager/dunning/${billId}`, fallback);
}
