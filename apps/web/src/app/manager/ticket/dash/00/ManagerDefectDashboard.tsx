"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { markManagerTicketRead } from "@/lib/manager-ticket-unread";
import type { ManagerProxyIntakeRoom } from "@/lib/ticket-manager-api";
import { SelfRepairBadge } from "../../_components/ticket-manager-ui";
import { ManagerProxyIntakeDialog } from "./ManagerProxyIntakeDialog";
import styles from "./proxy-intake.module.css";
import { TicketActionMenu } from "./TicketActionMenu";
import { TicketChatPanel } from "./TicketChatPanel";
import {
  DEFECT_STATUS_FILTERS,
  countDefectStatuses,
  defectDisplayStatus,
  filterDefectRows,
  formatDefectDate,
  formatDefectMoney,
  paginateDefectRows,
  type DefectDashboardFilters,
  type DefectDashboardRow,
  type DefectDisplayStatus,
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
  unread: "미확인",
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

const displayStatusLabel: Record<DefectDisplayStatus, string> = {
  completed: "완료",
  vendor_selected: "업체 선정",
  incomplete: "미완료",
  cancelled: "취소",
};

function DashboardRow({
  row,
  isSelected,
  onSelect,
}: {
  row: DefectDashboardRow;
  isSelected: boolean;
  onSelect: (row: DefectDashboardRow) => void;
}) {
  const displayStatus = defectDisplayStatus(row);

  return (
    <tr
      data-unread={row.isManagerUnread ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      className="manager-defect-dashboard__row"
      onClick={() => onSelect(row)}
    >
      <td>
        <span
          className="manager-defect-dashboard__type-badge"
          data-ticket-type={row.ticket.type}
        >
          {ticketTypeLabel[row.ticket.type]}
        </span>
      </td>
      <td>
        {/* 행 전체가 대화 패널을 연다 — 작업명은 그 안에서 눌러도 같은 동작이라 버튼만 유지 */}
        <button type="button" className="manager-defect-dashboard__job-link">
          {row.isManagerUnread ? (
            <span className="manager-defect-dashboard__unread-label">
              <span
                className="manager-defect-dashboard__unread-dot"
                aria-hidden="true"
              />
              <span className="manager-defect-dashboard__unread-badge">미확인</span>
            </span>
          ) : null}
          <span>{row.ticket.title}</span>
        </button>
      </td>
      <td className="manager-defect-dashboard__muted-cell">
        {row.buildingName ?? "—"}
      </td>
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
        <div style={{ display: "grid", gap: "var(--space-xs)", justifyItems: "start" }}>
          <span
            className="manager-defect-dashboard__status-badge"
            data-status={displayStatus}
          >
            {displayStatusLabel[displayStatus]}
          </span>
          <SelfRepairBadge ticket={row.ticket} />
        </div>
      </td>
      <td onClick={(event) => event.stopPropagation()}>
        <div className="manager-defect-dashboard__action">
          <TicketActionMenu
            ticketId={row.ticket.id}
            ticketTitle={row.ticket.title}
          />
        </div>
      </td>
    </tr>
  );
}

export function ManagerDefectDashboard({
  rows,
  proxyIntakeRooms,
  initialTemplate = "all",
}: {
  rows: readonly DefectDashboardRow[];
  proxyIntakeRooms: readonly ManagerProxyIntakeRoom[];
  initialTemplate?: DefectDashboardFilters["template"];
}) {
  const [filters, setFilters] = useState<DefectDashboardFilters>({
    status: "all",
    worker: "all",
    building: "all",
    template: initialTemplate,
  });
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<DefectDashboardRow | null>(null);
  const [locallyReadTicketIds, setLocallyReadTicketIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [proxyIntakeOpen, setProxyIntakeOpen] = useState(false);

  const effectiveRows = useMemo(
    () =>
      rows.map((row) =>
        locallyReadTicketIds.has(row.ticket.id)
          ? { ...row, isManagerUnread: false }
          : row,
      ),
    [locallyReadTicketIds, rows],
  );
  const counts = useMemo(() => countDefectStatuses(effectiveRows), [effectiveRows]);
  const workers = useMemo(
    () =>
      Array.from(
        new Set(
          effectiveRows.flatMap((row) =>
            row.repair?.vendorName ? [row.repair.vendorName] : [],
          ),
        ),
      ).sort((left, right) => left.localeCompare(right, "ko")),
    [effectiveRows],
  );
  const buildings = useMemo(
    () =>
      Array.from(
        new Set(
          effectiveRows.flatMap((row) =>
            row.buildingName ? [row.buildingName] : [],
          ),
        ),
      ).sort((left, right) => left.localeCompare(right, "ko")),
    [effectiveRows],
  );
  const filteredRows = useMemo(
    () => filterDefectRows(effectiveRows, filters),
    [effectiveRows, filters],
  );
  const pageResult = paginateDefectRows(filteredRows, page, PAGE_SIZE);
  const firstResult = filteredRows.length === 0 ? 0 : (pageResult.page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(pageResult.page * PAGE_SIZE, filteredRows.length);

  function updateFilters(next: Partial<DefectDashboardFilters>) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }

  function selectRow(row: DefectDashboardRow) {
    setSelectedRow(row);
    void markManagerTicketRead(row.ticket.id)
      .then(() => {
        setLocallyReadTicketIds((current) => {
          const next = new Set(current);
          next.add(row.ticket.id);
          return next;
        });
      })
      .catch(() => {
        // 패널은 그대로 열어두고 배지는 서버 저장이 성공할 때만 갱신한다.
      });
  }

  return (
    <section className="manager-defect-dashboard" aria-labelledby="manager-defect-title">
      <div className={styles.header}>
        <h2 id="manager-defect-title">
          {initialTemplate === "complaint" ? "민원 대응" : initialTemplate === "defect" ? "하자 관리" : "민원/하자 관리"}
        </h2>
        <div className={styles.headerAction}>
          <button
            type="button"
            className={styles.openButton}
            disabled={proxyIntakeRooms.length === 0}
            aria-describedby={proxyIntakeRooms.length === 0 ? "proxy-intake-empty-hint" : undefined}
            onClick={() => setProxyIntakeOpen(true)}
          >대리 접수</button>
          {proxyIntakeRooms.length === 0 ? (
            <span id="proxy-intake-empty-hint" className={styles.emptyHint}>
              대리 접수 가능한 호실이 없습니다.
            </span>
          ) : null}
        </div>
      </div>

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
        <label htmlFor="manager-defect-template">
          <span>유형</span>
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
            onChange={(event) => updateFilters({ building: event.target.value })}
          >
            <option value="all">전체</option>
            {buildings.map((building) => (
              <option key={building} value={building}>
                {building}
              </option>
            ))}
            <option value="missing">정보 없음</option>
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
              <DashboardRow
                key={row.ticket.id}
                row={row}
                isSelected={selectedRow?.ticket.id === row.ticket.id}
                onSelect={selectRow}
              />
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

      {proxyIntakeOpen ? (
        <ManagerProxyIntakeDialog
          rooms={proxyIntakeRooms}
          onClose={() => setProxyIntakeOpen(false)}
        />
      ) : null}

      <TicketChatPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
    </section>
  );
}
