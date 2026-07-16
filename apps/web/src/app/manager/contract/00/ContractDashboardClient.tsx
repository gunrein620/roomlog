"use client";

import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, EllipsisVertical } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ManagerContractDashboard, ManagerContractRow } from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  placeTicketActionMenu,
  type TicketActionMenuPosition,
} from "../../ticket/dash/00/ticket-action-menu-position";

const PAGE_SIZE = 10;

const CONTRACT_TABLE_COLUMNS = [
  "우선",
  "검토상태",
  "건물",
  "호실",
  "임차인",
  "업로드",
  "월세",
  "관리비",
  "납부일",
  "시작일",
  "종료일",
  "D-Day",
  "확인",
  "작업",
] as const;

type ContractStatusFilter = "all" | "needs_check" | "sla" | "pending" | "expiring";
type ContractOriginFilter = "all" | ManagerContractRow["origin"];

const statusFilterLabels: Record<ContractStatusFilter, string> = {
  all: "전체",
  needs_check: "확인 필요",
  sla: "검토 필요",
  pending: "검토 대기",
  expiring: "만료 예정",
};

const originFilterLabels: Record<ContractOriginFilter, string> = {
  all: "전체",
  tenant_upload: "임차인",
  manager_upload: "관리자",
  manual: "수동",
};

export function ContractDashboardClient({
  counts,
  rows,
  focusedContractId,
}: {
  counts: ManagerContractDashboard["counts"];
  rows: ManagerContractRow[];
  focusedContractId?: string;
}) {
  const [filters, setFilters] = useState({
    status: "all" as ContractStatusFilter,
    building: "all",
    origin: "all" as ContractOriginFilter,
    query: "",
  });
  const focusedRowIndex = focusedContractId
    ? rows.findIndex((row) => row.contract.id === focusedContractId)
    : -1;
  const [page, setPage] = useState(
    focusedRowIndex >= 0 ? Math.floor(focusedRowIndex / PAGE_SIZE) + 1 : 1,
  );

  const buildings = useMemo(
    () =>
      Array.from(new Set(rows.flatMap((row) => (row.buildingName ? [row.buildingName] : [])))).sort((left, right) =>
        left.localeCompare(right, "ko-KR")
      ),
    [rows]
  );
  const statusCounts = useMemo(() => countContractStatuses(rows, counts), [rows, counts]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearchText(filters.query);

    return rows.filter((row) => {
      const matchesStatus = contractMatchesStatus(row, filters.status);
      const matchesBuilding = filters.building === "all" || row.buildingName === filters.building;
      const matchesOrigin = filters.origin === "all" || row.origin === filters.origin;
      const matchesQuery = !normalizedQuery || contractSearchText(row).includes(normalizedQuery);

      return matchesStatus && matchesBuilding && matchesOrigin && matchesQuery;
    });
  }, [filters, rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstResult = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(currentPage * PAGE_SIZE, filteredRows.length);
  const focusedRow = focusedRowIndex >= 0 ? rows[focusedRowIndex] : undefined;

  useEffect(() => {
    if (!focusedContractId) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(contractRowId(focusedContractId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, focusedContractId]);

  function updateFilters(next: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }

  return (
    <section className="manager-contract-dashboard" aria-labelledby="manager-contract-dashboard-title">
      <h2 id="manager-contract-dashboard-title">계약 목록 · 검토대기/확인필요/검토 필요 상단</h2>

      {focusedRow ? (
        <div className="manager-contract-dashboard__confirmation" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>검토 확정이 완료되었습니다</strong>
            <span>
              {focusedRow.buildingName} {focusedRow.contract.unitId}호 · {focusedRow.tenantName}
            </span>
          </div>
        </div>
      ) : null}

      <div className="manager-contract-dashboard__filter-header">
        <div className="manager-contract-dashboard__status-filters" aria-label="계약 상태 필터">
          {(Object.keys(statusFilterLabels) as ContractStatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filters.status === status}
              onClick={() => updateFilters({ status })}
            >
              {statusFilterLabels[status]} {statusCounts[status]}
            </button>
          ))}
        </div>

        <Link className="manager-contract-dashboard__create-link" href={MANAGER_CONTRACT_ROUTES["M-DOC-02"]}>
          계약서 등록
        </Link>
      </div>

      <div className="manager-contract-dashboard__filter-panel">
        <label className="manager-contract-dashboard__search-field" htmlFor="manager-contract-search">
          <span>검색</span>
          <input
            id="manager-contract-search"
            aria-label="계약 검색"
            placeholder="건물, 호실, 임차인 검색"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
          />
        </label>

        <label htmlFor="manager-contract-building">
          <span>건물</span>
          <select
            id="manager-contract-building"
            value={filters.building}
            onChange={(event) => updateFilters({ building: event.target.value })}
          >
            <option value="all">전체</option>
            {buildings.map((building) => (
              <option key={building} value={building}>
                {building}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="manager-contract-origin">
          <span>업로드</span>
          <select
            id="manager-contract-origin"
            value={filters.origin}
            onChange={(event) => updateFilters({ origin: event.target.value as ContractOriginFilter })}
          >
            {(Object.keys(originFilterLabels) as ContractOriginFilter[]).map((origin) => (
              <option key={origin} value={origin}>
                {originFilterLabels[origin]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ContractDashboardTable rows={pageRows} focusedContractId={focusedContractId} />

      <footer className="manager-contract-dashboard__pagination">
        <span>
          Showing {firstResult} to {lastResult} of {filteredRows.length} entries
        </span>
        <nav aria-label="계약 목록 페이지">
          <button
            type="button"
            aria-label="이전 페이지"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-label={`${pageNumber} 페이지`}
              aria-current={currentPage === pageNumber ? "page" : undefined}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            aria-label="다음 페이지"
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  );
}

function ContractDashboardTable({
  rows,
  focusedContractId,
}: {
  rows: ManagerContractRow[];
  focusedContractId?: string;
}) {
  const [openMenuContractId, setOpenMenuContractId] = useState<string | null>(null);

  return (
    <div className="manager-contract-table-wrap">
      <table className="manager-contract-table">
        <thead>
          <tr>
            {CONTRACT_TABLE_COLUMNS.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const priority = priorityFor(row);
            const detailHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${row.contract.id}`;
            const isFocused = row.contract.id === focusedContractId;
            const rowClassName = [
              row.slaOverdue || row.needsCheckCount > 0 ? "is-attention" : "",
              isFocused ? "is-focused" : "",
            ].filter(Boolean).join(" ") || undefined;

            return (
              <tr
                key={row.contract.id}
                id={contractRowId(row.contract.id)}
                className={rowClassName}
                aria-current={isFocused ? "true" : undefined}
              >
                <td>
                  <span className={`manager-contract-priority manager-contract-priority--${priority.kind}`}>
                    {priority.label}
                  </span>
                </td>
                <td>
                  <span className={`manager-contract-table__status manager-contract-table__status--${priority.kind}`}>
                    {row.slaOverdue ? "검토 필요" : row.statusLabel}
                  </span>
                </td>
                <td>
                  <Link href={detailHref} className="manager-contract-table__primary-link">
                    {row.buildingName}
                  </Link>
                </td>
                <td className="manager-contract-table__number">{row.contract.unitId}호</td>
                <td className="manager-contract-table__strong">{row.tenantName}</td>
                <td className="manager-contract-table__muted">{originLabel(row.origin)}</td>
                <td className="manager-contract-table__money">{moneyLabel(row.contract.monthlyRent)}</td>
                <td className="manager-contract-table__money">{moneyLabel(row.contract.maintenanceFee)}</td>
                <td className="manager-contract-table__center">{paymentDayLabel(row.contract.paymentDay)}</td>
                <td className="manager-contract-table__date">{shortDate(row.contract.startDate ?? row.contract.createdAt)}</td>
                <td className="manager-contract-table__date">{shortDate(row.contract.endDate)}</td>
                <td className="manager-contract-table__center">{expiryLabel(row)}</td>
                <td className="manager-contract-table__center">{row.needsCheckCount}개</td>
                <td>
                  <div className="manager-contract-table__action">
                    <ContractActionMenu
                      row={row}
                      detailHref={detailHref}
                      open={openMenuContractId === row.contract.id}
                      setOpenMenuContractId={setOpenMenuContractId}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td className="manager-contract-table__empty" colSpan={CONTRACT_TABLE_COLUMNS.length}>
                조건에 맞는 계약이 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ContractActionMenu({
  row,
  detailHref,
  open,
  setOpenMenuContractId,
}: {
  row: ManagerContractRow;
  detailHref: string;
  open: boolean;
  setOpenMenuContractId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TicketActionMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-xs"),
    );

    setPosition(
      placeTicketActionMenu({
        trigger: { top: trigger.top, right: trigger.right, bottom: trigger.bottom },
        menu: { width: menu.width, height: menu.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        gap: Number.isFinite(gap) ? gap : 0,
      }),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function dismissMenu() {
      setOpenMenuContractId(null);
      setPosition(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      dismissMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissMenu();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", dismissMenu, true);
    window.addEventListener("resize", dismissMenu);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", dismissMenu, true);
      window.removeEventListener("resize", dismissMenu);
    };
  }, [open, setOpenMenuContractId]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="manager-contract-table__more-action"
        aria-label={`${row.buildingName} ${row.contract.unitId}호 계약 작업 메뉴`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setPosition(null);
          setOpenMenuContractId((current) =>
            current === row.contract.id ? null : row.contract.id,
          );
        }}
      >
        <EllipsisVertical aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="manager-contract-table__more-menu-list"
              role="menu"
              data-placement={position?.placement}
              data-positioned={position ? "true" : "false"}
              style={position ? { top: position.top, left: position.left } : undefined}
            >
              <Link role="menuitem" href={detailHref}>
                검토 열기
              </Link>
              <Link role="menuitem" href={detailHref}>
                OCR 대조
              </Link>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function contractSearchText(row: ManagerContractRow) {
  return normalizeSearchText(
    [
      row.buildingName,
      row.contract.unitId,
      `${row.contract.unitId}호`,
      row.tenantName,
      row.statusLabel,
      originLabel(row.origin),
      moneyLabel(row.contract.monthlyRent),
      moneyLabel(row.contract.maintenanceFee),
      paymentDayLabel(row.contract.paymentDay),
      shortDate(row.contract.startDate ?? row.contract.createdAt),
      shortDate(row.contract.endDate),
    ].join(" ")
  );
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function contractRowId(contractId: string) {
  return `manager-contract-row-${encodeURIComponent(contractId)}`;
}

function countContractStatuses(rows: ManagerContractRow[], counts: ManagerContractDashboard["counts"]) {
  return {
    all: rows.length,
    needs_check: counts.needsCheck,
    sla: counts.slaOverdue,
    pending: counts.pending,
    expiring: counts.expiringSoon,
  } satisfies Record<ContractStatusFilter, number>;
}

function contractMatchesStatus(row: ManagerContractRow, status: ContractStatusFilter) {
  if (status === "needs_check") return row.needsCheckCount > 0;
  if (status === "sla") return row.slaOverdue;
  if (status === "pending") return row.contract.review === "pending";
  if (status === "expiring") return row.daysToExpire <= 30;
  return true;
}

function priorityFor(row: ManagerContractRow) {
  if (row.slaOverdue) return { kind: "sla", label: "검토" };
  if (row.needsCheckCount > 0) return { kind: "check", label: "확인" };
  if (row.contract.review === "pending") return { kind: "pending", label: "대기" };
  if (row.daysToExpire <= 30) return { kind: "expire", label: "만료" };

  return { kind: "normal", label: "일반" };
}

function originLabel(origin: ManagerContractRow["origin"]) {
  if (origin === "tenant_upload") return "임차인";
  if (origin === "manager_upload") return "관리자";
  return "수동";
}

function moneyLabel(value?: number) {
  if (!value) return "-";
  return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
}

function paymentDayLabel(value?: number) {
  return value ? `${value}일` : "-";
}

function shortDate(iso?: string) {
  if (!iso) return "-";
  return iso.slice(0, 10).replaceAll("-", ".");
}

function expiryLabel(row: ManagerContractRow) {
  if (row.daysToExpire === 0) return "만료";
  return `D-${row.daysToExpire}`;
}
