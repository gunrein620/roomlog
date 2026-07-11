import type { Ticket } from "@roomlog/types";
import { ticketStatusGroup, type DefectDashboardRow } from "./ticket-dashboard-model";

export type ComplaintCategoryId = "repair" | "noise" | "billing" | "other";

export type ComplaintCalendarDay = {
  date: Date;
  key: string;
  label: number;
  inCurrentMonth: boolean;
};

export type ComplaintDashboard = {
  monthLabel: string;
  comparisonLabel: "지난 달 대비" | "전일 대비";
  summary: {
    total: number;
    inProgress: number;
    waiting: number;
    completed: number;
    change: number;
  };
  trend: readonly { label: string; count: number; current: boolean }[];
  categories: readonly {
    id: ComplaintCategoryId;
    label: string;
    count: number;
    percent: number;
  }[];
  recent: readonly DefectDashboardRow[];
};

const CATEGORY_LABEL: Record<ComplaintCategoryId, string> = {
  repair: "수리 요청",
  noise: "소음 민원",
  billing: "결제 문의",
  other: "기타",
};

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function monthParts(month: Date) {
  const { year, month: monthNumber } = dateParts(month);
  return { year, month: monthNumber };
}

function monthKey(month: Date) {
  const parts = monthParts(month);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function shiftMonth(month: Date, amount: number) {
  const parts = monthParts(month);
  return new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1, 12));
}

function ticketMonthKey(ticket: Ticket) {
  return monthKey(new Date(ticket.createdAt));
}

function dateKey(date: Date) {
  const parts = dateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function ticketDateKey(ticket: Ticket) {
  return dateKey(new Date(ticket.createdAt));
}

function rowsForMonth(rows: readonly DefectDashboardRow[], month: Date) {
  const key = monthKey(month);
  return rows.filter(
    (row) => row.ticket.type === "complaint" && ticketMonthKey(row.ticket) === key,
  );
}

function rowsForDate(rows: readonly DefectDashboardRow[], date: Date) {
  const key = dateKey(date);
  return rows.filter(
    (row) => row.ticket.type === "complaint" && ticketDateKey(row.ticket) === key,
  );
}

function previousDate(date: Date) {
  const parts = dateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1, 12));
}

export function buildComplaintCalendar(month: Date): ComplaintCalendarDay[] {
  const parts = monthParts(month);
  const firstDay = new Date(Date.UTC(parts.year, parts.month - 1, 1, 12));
  const startDay = 1 - firstDay.getUTCDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, startDay + index, 12));
    const cellParts = dateParts(date);
    return {
      date,
      key: dateKey(date),
      label: cellParts.day,
      inCurrentMonth: cellParts.year === parts.year && cellParts.month === parts.month,
    };
  });
}

export function complaintCategory(ticket: Ticket): ComplaintCategoryId {
  const content = `${ticket.title} ${ticket.description}`.toLowerCase();
  if (/소음|소란|진동/.test(content)) return "noise";
  if (/결제|관리비|납부/.test(content)) return "billing";
  if (/수리|교체|배수|누수|고장|불량|점검|설비|환풍|조명|수전|전기|배관/.test(content)) {
    return "repair";
  }
  return "other";
}

export function complaintStatusLabel(status: Ticket["status"]) {
  const group = ticketStatusGroup(status);
  if (group === "in_progress") return "처리 중";
  if (group === "completed") return "완료";
  if (group === "cancelled") return "취소";
  return "대기";
}

export function formatComplaintDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function buildComplaintDashboard(
  rows: readonly DefectDashboardRow[],
  month: Date,
  selectedDate: Date | null = null,
): ComplaintDashboard {
  const currentRows = selectedDate ? rowsForDate(rows, selectedDate) : rowsForMonth(rows, month);
  const previousRows = selectedDate
    ? rowsForDate(rows, previousDate(selectedDate))
    : rowsForMonth(rows, shiftMonth(month, -1));
  const total = currentRows.length;
  const previousTotal = previousRows.length;
  const byStatus = (group: "waiting" | "in_progress" | "completed") =>
    currentRows.filter((row) => ticketStatusGroup(row.ticket.status) === group).length;

  const categories = (["repair", "noise", "billing", "other"] as const).map((id) => {
    const count = currentRows.filter((row) => complaintCategory(row.ticket) === id).length;
    return {
      id,
      label: CATEGORY_LABEL[id],
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });

  const trend = Array.from({ length: 6 }, (_, index) => {
    const trendMonth = shiftMonth(month, index - 5);
    const parts = monthParts(trendMonth);
    const key = monthKey(trendMonth);
    return {
      label: `${parts.month}월`,
      count: rows.filter(
        (row) => row.ticket.type === "complaint" && ticketMonthKey(row.ticket) === key,
      ).length,
      current: index === 5,
    };
  });

  return {
    monthLabel: selectedDate
      ? dateKey(selectedDate).replaceAll("-", ".")
      : `${monthParts(month).year}.${String(monthParts(month).month).padStart(2, "0")}`,
    comparisonLabel: selectedDate ? "전일 대비" : "지난 달 대비",
    summary: {
      total,
      inProgress: byStatus("in_progress"),
      waiting: byStatus("waiting"),
      completed: byStatus("completed"),
      change:
        previousTotal === 0 ? (total === 0 ? 0 : 100) : Math.round(((total - previousTotal) / previousTotal) * 100),
    },
    trend,
    categories,
    recent: [...currentRows].sort(
      (left, right) => Date.parse(right.ticket.createdAt) - Date.parse(left.ticket.createdAt),
    ).slice(0, 5),
  };
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeComplaintDashboardCsv(
  rows: readonly DefectDashboardRow[],
  month: Date,
  selectedDate: Date | null = null,
) {
  const dashboard = buildComplaintDashboard(rows, month, selectedDate);
  const headers = ["유형", "내용", "건물/호실", "접수일", "상태"];
  const records = dashboard.recent.map((row) => [
    CATEGORY_LABEL[complaintCategory(row.ticket)],
    row.ticket.title,
    `${row.buildingName ?? "—"} / ${row.ticket.unitId || "—"}`,
    formatComplaintDate(row.ticket.createdAt),
    complaintStatusLabel(row.ticket.status),
  ]);
  return [headers.join(","), ...records.map((record) => record.map(csvCell).join(","))].join("\n");
}

export function latestComplaintMonth(rows: readonly DefectDashboardRow[]) {
  const latest = rows
    .filter((row) => row.ticket.type === "complaint")
    .map((row) => row.ticket.createdAt)
    .sort()
    .at(-1);
  return latest ? new Date(`${latest.slice(0, 7)}-01T12:00:00+09:00`) : new Date();
}
