import type { RepairJob, Ticket, TicketStatus } from "@roomlog/types";

export type DefectStatusFilter =
  | "all"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "periodic";

export type DefectDashboardRow = {
  ticket: Ticket;
  repair?: RepairJob;
  buildingName?: string;
  attachmentUrls?: string[];
};

export type DefectDisplayStatus =
  | "completed"
  | "vendor_selected"
  | "incomplete"
  | "cancelled";

export type DefectDashboardFilters = {
  status: DefectStatusFilter;
  worker: "all" | string;
  building: string;
  template: "all" | Ticket["type"];
};

export const DEFECT_STATUS_FILTERS = [
  ["all", "전체"],
  ["waiting", "대기"],
  ["in_progress", "진행중"],
  ["completed", "완료"],
  ["cancelled", "취소"],
  ["periodic", "정기점검"],
] as const;

type TicketStatusGroup = Exclude<DefectStatusFilter, "all" | "periodic">;

export function ticketStatusGroup(status: TicketStatus): TicketStatusGroup {
  if (["received", "reviewing", "info_requested", "reopened"].includes(status)) {
    return "waiting";
  }
  if (status === "processing") return "in_progress";
  if (status === "resolved") return "completed";
  return "cancelled";
}

export function defectDisplayStatus(row: DefectDashboardRow): DefectDisplayStatus {
  if (row.ticket.status === "cancelled") return "cancelled";
  if (
    row.ticket.status === "resolved" ||
    row.repair?.stage === "completed" ||
    row.repair?.stage === "paid"
  ) {
    return "completed";
  }
  if (
    row.repair &&
    ["vendor_assigned", "quoted", "scheduled"].includes(row.repair.stage)
  ) {
    return "vendor_selected";
  }
  return "incomplete";
}

export function countDefectStatuses(rows: readonly DefectDashboardRow[]) {
  const counts: Record<DefectStatusFilter, number> = {
    all: rows.length,
    waiting: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    periodic: 0,
  };

  for (const row of rows) {
    counts[ticketStatusGroup(row.ticket.status)] += 1;
  }

  return counts;
}

export function filterDefectRows(
  rows: readonly DefectDashboardRow[],
  filters: DefectDashboardFilters,
) {
  if (filters.status === "periodic") return [];

  return rows.filter((row) => {
    const statusMatches =
      filters.status === "all" || ticketStatusGroup(row.ticket.status) === filters.status;
    const workerMatches =
      filters.worker === "all" || row.repair?.vendorName === filters.worker;
    const buildingMatches =
      filters.building === "all" ||
      (filters.building === "missing"
        ? !row.buildingName
        : row.buildingName === filters.building);
    const templateMatches =
      filters.template === "all" || row.ticket.type === filters.template;

    return statusMatches && workerMatches && buildingMatches && templateMatches;
  });
}

export function paginateDefectRows(
  rows: readonly DefectDashboardRow[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page) || 1));
  const start = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    totalPages,
    rows: rows.slice(start, start + safePageSize),
  };
}

export function formatDefectDate(iso?: string) {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const period = value("dayPeriod").toUpperCase() === "PM" ? "오후" : "오전";

  return `${value("month")}. ${value("day")}. ${period} ${value("hour")}:${value("minute")}`;
}

export function formatDefectMoney(amount?: number) {
  return typeof amount === "number" ? new Intl.NumberFormat("ko-KR").format(amount) : "—";
}

export function resolveManagerAttachmentUrl(
  url: string,
  publicApiBase = process.env.NEXT_PUBLIC_API_URL ?? "",
) {
  const normalizedUrl = url.trim();
  const normalizedBase = publicApiBase.trim().replace(/\/+$/, "");

  if (!normalizedUrl.startsWith("/api/") || !/^https?:\/\//.test(normalizedBase)) {
    return normalizedUrl;
  }

  return normalizedBase.endsWith("/api")
    ? `${normalizedBase}${normalizedUrl.slice(4)}`
    : `${normalizedBase}${normalizedUrl}`;
}
