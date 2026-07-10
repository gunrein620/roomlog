"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, EllipsisVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { ticketDashHref } from "../../_components/ticket-manager-ui";
import {
  DEFECT_STATUS_FILTERS,
  countDefectStatuses,
  filterDefectRows,
  formatDefectDate,
  formatDefectMoney,
  paginateDefectRows,
  ticketStatusGroup,
  type DefectDashboardFilters,
  type DefectDashboardRow,
  type DefectStatusFilter,
} from "./ticket-dashboard-model";

const PAGE_SIZE = 10;
const TABLE_COLUMNS = [
  "유형",
  "작업명",
  "건물",
  "호실",
  "작업자",
  "예정일시",
  "청구 금액",
  "상태",
  "작업",
] as const;

const statusFilterLabel: Record<DefectStatusFilter, string> = {
  all: "전체",
  waiting: "대기",
  in_progress: "진행중",
  completed: "완료",
  cancelled: "취소",
  periodic: "정기점검",
};

const ticketTypeLabel = {
  defect: "하자 민원",
  complaint: "일반 민원",
} as const;

const ticketStateLabel = {
  received: "대기",
  reviewing: "대기",
  info_requested: "대기",
  processing: "진행중",
  resolved: "완료",
  reopened: "대기",
  cancelled: "취소",
} as const;

function DashboardRow({ row }: { row: DefectDashboardRow }) {
  const statusGroup = ticketStatusGroup(row.ticket.status);

  return (
    <tr>
      <td>
        <span
          className="manager-defect-dashboard__type-badge"
          data-ticket-type={row.ticket.type}
        >
          {ticketTypeLabel[row.ticket.type]}
        </span>
      </td>
      <td>
        <Link
          className="manager-defect-dashboard__job-link"
          href={ticketDashHref("01", row.ticket.id)}
        >
          {row.ticket.title}
        </Link>
      </td>
      <td className="manager-defect-dashboard__muted-cell">—</td>
      <td className="manager-defect-dashboard__muted-cell">{row.ticket.unitId || "—"}</td>
      <td className="manager-defect-dashboard__muted-cell">
        {row.repair?.vendorName ?? "미배정"}
      </td>
      <td className="manager-defect-dashboard__muted-cell">
        {formatDefectDate(row.repair?.scheduledAt)}
      </td>
      <td className="manager-defect-dashboard__amount">
        {formatDefectMoney(row.repair?.quoteAmount)}
      </td>
      <td>
        <span
          className="manager-defect-dashboard__status-badge"
          data-status={statusGroup}
        >
          {ticketStateLabel[row.ticket.status]}
        </span>
      </td>
      <td>
        <div className="manager-defect-dashboard__action">
          <Link
            className="manager-defect-dashboard__primary-action"
            href={ticketDashHref("01", row.ticket.id)}
          >
            정보입력
          </Link>
          <Link
            className="manager-defect-dashboard__more-action"
            href={ticketDashHref("01", row.ticket.id)}
            aria-label={`${row.ticket.title} 추가 작업`}
          >
            <EllipsisVertical aria-hidden="true" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

export function ManagerDefectDashboard({
  rows,
}: {
  rows: readonly DefectDashboardRow[];
}) {
  const [filters, setFilters] = useState<DefectDashboardFilters>({
    status: "all",
    worker: "all",
    building: "all",
    template: "all",
  });
  const [page, setPage] = useState(1);

  const counts = useMemo(() => countDefectStatuses(rows), [rows]);
  const workers = useMemo(
    () =>
      Array.from(
        new Set(
          rows.flatMap((row) =>
            row.repair?.vendorName ? [row.repair.vendorName] : [],
          ),
        ),
      ).sort((left, right) => left.localeCompare(right, "ko")),
    [rows],
  );
  const filteredRows = useMemo(() => filterDefectRows(rows, filters), [rows, filters]);
  const pageResult = paginateDefectRows(filteredRows, page, PAGE_SIZE);
  const firstResult = filteredRows.length === 0 ? 0 : (pageResult.page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(pageResult.page * PAGE_SIZE, filteredRows.length);

  function updateFilters(next: Partial<DefectDashboardFilters>) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }

  return (
    <section className="manager-defect-dashboard" aria-labelledby="manager-defect-title">
      <h2 id="manager-defect-title">하자 관리</h2>

      <div
        className="manager-defect-dashboard__status-filters"
        aria-label="하자 상태 필터"
      >
        {DEFECT_STATUS_FILTERS.map(([value]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.status === value}
            onClick={() => updateFilters({ status: value })}
          >
            {statusFilterLabel[value]}
            {value === "periodic" ? "" : ` ${counts[value]}`}
          </button>
        ))}
      </div>

      <div className="manager-defect-dashboard__filter-panel">
        <label htmlFor="manager-defect-worker">
          <span>담당자</span>
          <select
            id="manager-defect-worker"
            value={filters.worker}
            onChange={(event) => updateFilters({ worker: event.target.value })}
          >
            <option value="all">전체</option>
            {workers.map((worker) => (
              <option key={worker} value={worker}>
                {worker}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="manager-defect-building">
          <span>건물</span>
          <select
            id="manager-defect-building"
            value={filters.building}
            onChange={(event) =>
              updateFilters({
                building: event.target.value as DefectDashboardFilters["building"],
              })
            }
          >
            <option value="all">전체</option>
            <option value="missing">정보 없음</option>
          </select>
        </label>

        <label htmlFor="manager-defect-template">
          <span>템플릿</span>
          <select
            id="manager-defect-template"
            value={filters.template}
            onChange={(event) =>
              updateFilters({
                template: event.target.value as DefectDashboardFilters["template"],
              })
            }
          >
            <option value="all">전체</option>
            <option value="defect">하자 민원</option>
            <option value="complaint">일반 민원</option>
          </select>
        </label>
      </div>

      <div className="manager-defect-dashboard__table-scroll">
        <table className="manager-defect-dashboard__table">
          <thead>
            <tr>
              {TABLE_COLUMNS.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageResult.rows.map((row) => (
              <DashboardRow key={row.ticket.id} row={row} />
            ))}
            {pageResult.rows.length === 0 ? (
              <tr>
                <td className="manager-defect-dashboard__empty" colSpan={9}>
                  조건에 맞는 하자·민원 티켓이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <footer className="manager-defect-dashboard__pagination">
        <span>
          Showing {firstResult} to {lastResult} of {filteredRows.length} entries
        </span>
        <nav aria-label="하자 목록 페이지">
          <button
            type="button"
            aria-label="이전 페이지"
            disabled={pageResult.page === 1}
            onClick={() => setPage(pageResult.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          {Array.from({ length: pageResult.totalPages }, (_, index) => index + 1).map(
            (pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                aria-label={`${pageNumber} 페이지`}
                aria-current={pageResult.page === pageNumber ? "page" : undefined}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="다음 페이지"
            disabled={pageResult.page === pageResult.totalPages}
            onClick={() => setPage(pageResult.page + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  );
}
