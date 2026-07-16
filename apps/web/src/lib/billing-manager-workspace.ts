import type {
  BillStatus,
  DunningGuard,
  ManagerBillRow,
  ManagerCollectionPoint,
  ManagerTransactionLedgerRow,
  OverdueCase,
} from "@roomlog/types";

export type DashboardQuickFilter = "all" | "needs_review" | "paid" | "overdue";
export type DashboardReviewFilter = "all" | "payment_review" | "long_overdue";
export type DashboardBillSort = "unpaid_desc" | "due_asc" | "unit_asc" | "recent_desc";
export type OverdueAgeBucket = "all" | "1_7" | "8_30" | "31_plus";
export type OverdueSort = "days_desc" | "unpaid_desc";
export type CollectionPerformanceOrder = "desc" | "asc";

export interface CollectionPerformanceRow extends ManagerCollectionPoint {
  rateDelta?: number;
}

export interface DashboardBillFilters {
  quick?: DashboardQuickFilter;
  review?: DashboardReviewFilter;
  query?: string;
  status?: string;
  sort?: DashboardBillSort;
}

export interface BillingBuildingGroup {
  buildingName: string;
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  bills: ManagerBillRow[];
}

export type ManagerBillDisplayState = BillStatus | "payment_review";

type ManagerBillStatusSource = {
  status: BillStatus;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  daysOverdue?: number;
  guard?: DunningGuard;
};

type TransactionLedgerStatusSource = {
  linkedBillRelation?: ManagerTransactionLedgerRow["linkedBillRelation"];
  linkedBill?: Pick<
    NonNullable<ManagerTransactionLedgerRow["linkedBill"]>,
    "status" | "totalAmount" | "paidAmount"
  >;
};

const managerBillStatusLabels: Record<BillStatus, string> = {
  draft: "초안",
  sent: "수납 대기",
  confirming: "납부 확인 중",
  partially_paid: "일부 수납",
  paid: "수납 완료",
  overdue: "연체",
  corrected: "정정",
  canceled: "취소",
};

export function managerBillDisplayState(bill: ManagerBillStatusSource): ManagerBillDisplayState {
  const unpaid = Math.max(0, bill.totalAmount - bill.paidAmount);
  const parsedDueDate = Date.parse(bill.dueDate);
  const pastDue =
    (bill.daysOverdue ?? 0) > 0 ||
    (Number.isFinite(parsedDueDate) && parsedDueDate < Date.now());

  if (unpaid > 0 && pastDue && bill.guard?.blocked) return "payment_review";
  return bill.status;
}

export function managerBillStatusLabel(bill: ManagerBillStatusSource): string {
  if (managerBillDisplayState(bill) !== "payment_review") {
    return managerBillStatusLabels[bill.status];
  }

  if (bill.guard?.hasConfirming && bill.guard.hasOrphan) {
    return "납부·미연결 입금 확인 대기";
  }
  if (bill.guard?.hasOrphan) return "미연결 입금 확인 대기";
  if (bill.guard?.hasConfirming) return "납부 신고 확인 대기";
  return "입금 확인 대기";
}

export function shiftBillingMonth(month: string, offset: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return month;
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatBillingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatTransactionDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function transactionLedgerStatusLabel(row: TransactionLedgerStatusSource): string {
  if (row.linkedBillRelation !== "matched" || !row.linkedBill) {
    return "연결 확인 필요";
  }

  const unpaidAmount = Math.max(
    0,
    row.linkedBill.totalAmount - row.linkedBill.paidAmount,
  );
  if (unpaidAmount === 0) return "완납";
  if (row.linkedBill.paidAmount > 0) return "부분 수납";
  if (row.linkedBill.status === "confirming") return "납부 확인 중";
  return "수납 대기";
}

export function billingMonthDayCount(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return 31;
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function timingAxisLabel(day: number, lastDay: number): string {
  return day === 1 || day === lastDay || day % 5 === 0 ? String(day) : "";
}

export function collectionPerformanceRows(
  points: readonly ManagerCollectionPoint[],
  order: CollectionPerformanceOrder,
): CollectionPerformanceRow[] {
  const chronological = [...points].sort((left, right) =>
    left.billingMonth.localeCompare(right.billingMonth),
  );
  const rateDeltas = new Map<string, number | undefined>();

  chronological.forEach((point, index) => {
    const previous = chronological[index - 1];
    rateDeltas.set(
      point.billingMonth,
      previous ? point.collectionRate - previous.collectionRate : undefined,
    );
  });

  const ordered = order === "desc" ? [...chronological].reverse() : chronological;
  return ordered.map((point) => ({
    ...point,
    rateDelta: rateDeltas.get(point.billingMonth),
  }));
}

export function buildBillingScopeHref(
  pathname: string,
  scope: { building?: string; month?: string },
): string {
  const params = new URLSearchParams();
  if (scope.building) params.set("building", scope.building);
  if (scope.month) params.set("month", scope.month);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function unpaidAmount(bill: ManagerBillRow): number {
  return bill.unpaidAmount ?? Math.max(0, bill.totalAmount - bill.paidAmount);
}

function isLongActiveOverdue(bill: ManagerBillRow): boolean {
  return (
    bill.status === "overdue" &&
    !bill.guard?.blocked &&
    (bill.daysOverdue ?? 0) >= 31 &&
    unpaidAmount(bill) > 0
  );
}

function needsReview(bill: ManagerBillRow): boolean {
  return Boolean(bill.guard?.blocked) || isLongActiveOverdue(bill);
}

export function filterDashboardBills(
  bills: readonly ManagerBillRow[],
  filters: DashboardBillFilters = {},
): ManagerBillRow[] {
  const quick = filters.quick ?? "all";
  const review = filters.review ?? "all";
  const query = filters.query?.trim().toLocaleLowerCase("ko") ?? "";
  const filtered = bills.filter((bill) => {
    if (quick === "needs_review" && !needsReview(bill)) return false;
    if (quick === "paid" && bill.status !== "paid") return false;
    if (quick === "overdue" && (bill.status !== "overdue" || bill.guard?.blocked)) return false;
    if (quick === "needs_review" && review === "payment_review" && !bill.guard?.blocked) {
      return false;
    }
    if (quick === "needs_review" && review === "long_overdue" && !isLongActiveOverdue(bill)) {
      return false;
    }
    if (
      filters.status &&
      filters.status !== "all" &&
      managerBillDisplayState(bill) !== filters.status
    ) {
      return false;
    }
    if (
      query &&
      ![bill.buildingName, bill.unitId, bill.tenantName, bill.billingMonth]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko").includes(query))
    ) {
      return false;
    }
    return true;
  });

  if (!filters.sort) return filtered;
  return [...filtered].sort((left, right) => {
    if (filters.sort === "due_asc") return left.dueDate.localeCompare(right.dueDate);
    if (filters.sort === "unit_asc") {
      return `${left.buildingName ?? ""}-${left.unitId}`.localeCompare(
        `${right.buildingName ?? ""}-${right.unitId}`,
        "ko",
        { numeric: true },
      );
    }
    if (filters.sort === "recent_desc") {
      return right.billingMonth.localeCompare(left.billingMonth) || right.dueDate.localeCompare(left.dueDate);
    }
    return unpaidAmount(right) - unpaidAmount(left);
  });
}

export function groupBillsByBuilding(bills: readonly ManagerBillRow[]): BillingBuildingGroup[] {
  const grouped = new Map<string, ManagerBillRow[]>();
  for (const bill of bills) {
    const name = bill.buildingName || "건물 확인 필요";
    grouped.set(name, [...(grouped.get(name) ?? []), bill]);
  }
  return [...grouped.entries()].map(([buildingName, groupBills]) => ({
      buildingName,
      billedAmount: groupBills.reduce((sum, bill) => sum + bill.totalAmount, 0),
      collectedAmount: groupBills.reduce((sum, bill) => sum + bill.paidAmount, 0),
      unpaidAmount: groupBills.reduce((sum, bill) => sum + unpaidAmount(bill), 0),
      bills: groupBills,
    }));
}

export function filterOverdueCases(
  cases: readonly OverdueCase[],
  bucket: OverdueAgeBucket,
  query = "",
): OverdueCase[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  return cases.filter((item) => {
    if (bucket === "1_7" && !(item.daysOverdue >= 0 && item.daysOverdue <= 7)) return false;
    if (bucket === "8_30" && !(item.daysOverdue >= 8 && item.daysOverdue <= 30)) return false;
    if (bucket === "31_plus" && item.daysOverdue < 31) return false;
    if (
      normalizedQuery &&
      ![item.buildingName, item.unitId, item.tenantName, item.billingMonth]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko").includes(normalizedQuery))
    ) {
      return false;
    }
    return true;
  });
}

export function overdueStageLabel(daysOverdue: number): string {
  if (daysOverdue >= 31) return "31일 이상";
  if (daysOverdue >= 8) return "8~30일";
  return "7일 이내";
}

export function sortOverdueCases(
  cases: readonly OverdueCase[],
  sort: OverdueSort,
): OverdueCase[] {
  return [...cases].sort((left, right) => {
    const difference =
      sort === "unpaid_desc"
        ? right.unpaidAmount - left.unpaidAmount ||
          right.daysOverdue - left.daysOverdue
        : right.daysOverdue - left.daysOverdue ||
          right.unpaidAmount - left.unpaidAmount;
    return difference || left.billId.localeCompare(right.billId);
  });
}

export function managerAgentOverdueHref(item: OverdueCase): string {
  const params = new URLSearchParams({
    billId: item.billId,
    prompt: `${item.buildingName ?? "건물 미확인"} ${item.unitId}호 ${item.tenantName}님의 ${item.daysOverdue}일 경과 미수금 ${item.unpaidAmount.toLocaleString("ko-KR")}원 연체 독촉 문구를 준비해줘. 발송 전에는 반드시 나에게 확인받아.`,
  });
  return `/manager/agent/realtime?${params.toString()}`;
}
