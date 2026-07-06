import type {
  Bill,
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  ManagerBillRow,
  OverdueCase,
} from "@roomlog/types";
import { serverFetch } from "./server-api";
import {
  toBill,
  toCollectionSummary,
  toDeposit,
  toDunningDraft,
  toManagerDashboard,
  toManagerDepositsData,
  toOverdueCase,
  type ManagerPaymentReportRow,
  type TeamBill,
  type TeamCollection,
  type TeamDashboardResponse,
  type TeamDeposit,
  type TeamDepositsResponse,
  type TeamDunning,
  type TeamOverdue,
} from "./billing-manager-mapping";

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

interface TeamOverdueResponse {
  activeCases?: TeamOverdue[];
  waitingCases?: TeamOverdue[];
}

export interface SendDunningInput {
  text: string;
  channel: string;
}

const DEMO_ACCOUNT = {
  bankName: "하나은행",
  accountNumber: "123-456789-0000",
  accountHolder: "룸로그관리",
};

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

const DEMO_PAYMENT_REPORTS: ManagerPaymentReportRow[] = DEMO_BILLS.filter(
  (bill) => bill.status === "confirming"
).map((bill) => ({
  ...bill,
  reportId: `report-${bill.billId}`,
}));

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

const DEMO_MANAGER_BILLS: Bill[] = DEMO_BILLS.map(demoBillFromRow);

const DEMO_NEW_BILL: Bill = {
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
  paymentReports: DEMO_PAYMENT_REPORTS,
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

function demoBillFallback(billId?: string): Bill {
  if (billId === "new") return DEMO_NEW_BILL;
  return (
    DEMO_MANAGER_BILLS.find((bill) => bill.id === billId) ??
    DEMO_MANAGER_BILLS.find((bill) => bill.id === DEMO_MANAGER_BILL_ID) ??
    DEMO_MANAGER_BILLS[0] ??
    DEMO_NEW_BILL
  );
}

async function getTeamBillById(billId: string): Promise<TeamBill | null> {
  try {
    return await serverFetch<TeamBill>(`/manager/bills/${encodeURIComponent(billId)}`);
  } catch (error) {
    console.error(`[manager/billing-api] /manager/bills/${billId} 조회 실패:`, error);
    return null;
  }
}

async function resolveTeamBill(billId?: string): Promise<TeamBill | null> {
  if (billId && billId !== "active" && billId !== "new") return getTeamBillById(billId);

  try {
    const data = await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard");
    const firstBillId = data.bills?.[0]?.billId ?? data.bills?.[0]?.id;
    return firstBillId ? getTeamBillById(firstBillId) : null;
  } catch (error) {
    console.error("[manager/billing-api] 활성 청구서 조회 실패:", error);
    return null;
  }
}

export async function getManagerDashboard(): Promise<ManagerDashboardData> {
  try {
    return toManagerDashboard(await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard"));
  } catch (error) {
    console.error("[manager/billing-api] 대시보드 조회 실패 → 데모 폴백:", error);
    return DEMO_DASHBOARD;
  }
}

export async function getManagerBill(billId?: string): Promise<Bill> {
  if (billId === "new") return DEMO_NEW_BILL;

  const teamBill = await resolveTeamBill(billId);
  if (teamBill) return toBill(teamBill);

  console.warn("[manager/billing-api] 실제 청구서 없음 → 데모 청구서 폴백");
  return demoBillFallback(billId);
}

export async function getManagerCollection(): Promise<CollectionSummary> {
  try {
    return toCollectionSummary(await serverFetch<TeamCollection>("/manager/bills/collection"));
  } catch (error) {
    console.error("[manager/billing-api] 수금 현황 조회 실패 → 데모 폴백:", error);
    return DEMO_COLLECTION;
  }
}

export async function getManagerDeposits(): Promise<ManagerDepositsData> {
  try {
    return toManagerDepositsData(await serverFetch<TeamDepositsResponse>("/manager/bills/deposits"));
  } catch (error) {
    console.error("[manager/billing-api] 입금 매칭 조회 실패 → 데모 폴백:", error);
    return DEMO_DEPOSITS_DATA;
  }
}

export async function getManagerOverdue(): Promise<ManagerOverdueData> {
  try {
    const data = await serverFetch<TeamOverdueResponse>("/manager/bills/overdue");
    return {
      activeCases: (data.activeCases ?? []).map(toOverdueCase),
      waitingCases: (data.waitingCases ?? []).map(toOverdueCase),
    };
  } catch (error) {
    console.error("[manager/billing-api] 연체 목록 조회 실패 → 데모 폴백:", error);
    return DEMO_OVERDUE;
  }
}

export async function getManagerDunning(billId: string): Promise<DunningDraft> {
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

  try {
    return toDunningDraft(await serverFetch<TeamDunning>(`/manager/bills/${encodeURIComponent(billId)}/dunning`));
  } catch (error) {
    console.error(`[manager/billing-api] /manager/bills/${billId}/dunning 조회 실패 → 데모 폴백:`, error);
    return fallback;
  }
}

export async function matchManagerDeposit(
  depositId: string,
  billId: string
): Promise<Deposit | undefined> {
  try {
    return toDeposit(
      await serverFetch<TeamDeposit>(`/manager/bills/deposits/${encodeURIComponent(depositId)}/match`, {
        method: "POST",
        body: JSON.stringify({ billId }),
      })
    );
  } catch (error) {
    console.error(`[manager/billing-api] 입금 매칭 실패 deposit=${depositId} bill=${billId}:`, error);
    return undefined;
  }
}

export async function confirmManagerPaymentReport(
  billId: string,
  reportId: string
): Promise<Bill | undefined> {
  try {
    return toBill(
      await serverFetch<TeamBill>(
        `/manager/bills/${encodeURIComponent(billId)}/reports/${encodeURIComponent(reportId)}/confirm`,
        { method: "POST" }
      )
    );
  } catch (error) {
    console.error(`[manager/billing-api] 납부 신고 확정 실패 bill=${billId} report=${reportId}:`, error);
    return undefined;
  }
}

export async function sendManagerDunning(
  billId: string,
  input: SendDunningInput
): Promise<boolean> {
  try {
    const result = await serverFetch<{ ok: true }>(
      `/manager/bills/${encodeURIComponent(billId)}/dunning/send`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    return result.ok === true;
  } catch (error) {
    console.error(`[manager/billing-api] 독촉 발송 실패 bill=${billId}:`, error);
    return false;
  }
}
