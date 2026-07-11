import type {
  ManagerBillRow,
  ManagerCollectionBuildingRow,
  ManagerCollectionPoint,
  OverdueCase,
} from "@roomlog/types";

export type DashboardQuickFilter = "all" | "needs_review" | "paid" | "overdue";
export type DashboardReviewFilter = "all" | "payment_review" | "long_overdue";
export type DashboardBillSort = "unpaid_desc" | "due_asc" | "unit_asc" | "recent_desc";
export type CollectionBuildingSort =
  | "unpaid_desc"
  | "rate_asc"
  | "rate_desc"
  | "building_asc";
export type OverdueAgeBucket = "all" | "1_7" | "8_30" | "31_plus";

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

export function shiftBillingMonth(month: string, offset: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return month;
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
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
    (bill.daysOverdue ?? 0) >= 30 &&
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
    if (filters.status && filters.status !== "all" && bill.status !== filters.status) return false;
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

export function selectCollectionTrend(
  trend: readonly ManagerCollectionPoint[],
  period: 3 | 6 | 12,
): ManagerCollectionPoint[] {
  return [...trend]
    .filter(
      (point) =>
        point.billedAmount > 0 || point.collectedAmount > 0 || point.unpaidAmount > 0,
    )
    .sort((left, right) => left.billingMonth.localeCompare(right.billingMonth))
    .slice(-period);
}

export function sortCollectionBuildings(
  buildings: readonly ManagerCollectionBuildingRow[],
  sort: CollectionBuildingSort,
): ManagerCollectionBuildingRow[] {
  return [...buildings].sort((left, right) => {
    if (sort === "rate_asc") return left.collectionRate - right.collectionRate;
    if (sort === "rate_desc") return right.collectionRate - left.collectionRate;
    if (sort === "building_asc") return left.buildingName.localeCompare(right.buildingName, "ko");
    return right.unpaidAmount - left.unpaidAmount;
  });
}

export function filterOverdueCases(
  cases: readonly OverdueCase[],
  bucket: OverdueAgeBucket,
  query = "",
): OverdueCase[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  return cases.filter((item) => {
    if (bucket === "1_7" && !(item.daysOverdue >= 1 && item.daysOverdue <= 7)) return false;
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

export function managerAgentOverdueHref(item: OverdueCase): string {
  const params = new URLSearchParams({
    billId: item.billId,
    prompt: `${item.buildingName ?? "건물 미확인"} ${item.unitId}호 ${item.tenantName}님의 ${item.daysOverdue}일 경과 미수금 ${item.unpaidAmount.toLocaleString("ko-KR")}원 건을 검토해줘. 발송 전에는 반드시 나에게 확인받아.`,
  });
  return `/manager/agent/realtime?${params.toString()}`;
}
