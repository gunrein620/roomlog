import type { RentalReport } from "@roomlog/types";

const HEADERS = ["기준월", "실제 수납액(원)", "수리비(원)", "입주율(%)", "민원처리율(%)"];

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function percent(value: number | null) {
  return value === null ? "" : Number((value * 100).toFixed(1));
}

export function rentalReportCsv(report: RentalReport) {
  const rows = report.points.map((point) => [
    point.month,
    point.collectedAmount,
    point.repairCostAmount,
    percent(point.occupancyRate),
    percent(point.ticketResolutionRate)
  ]);

  return `\uFEFF${[HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
}
