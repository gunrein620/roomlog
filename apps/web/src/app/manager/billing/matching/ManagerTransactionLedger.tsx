"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type {
  ManagerTransactionLedgerData,
  ManagerTransactionLedgerRow,
} from "@roomlog/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Upload,
} from "lucide-react";
import {
  formatBillingDate,
  formatTransactionDateTime,
  transactionLedgerStatusLabel,
} from "@/lib/billing-manager-workspace";
import styles from "./manager-transaction-ledger.module.css";

interface ManagerTransactionLedgerProps {
  ledgerData: ManagerTransactionLedgerData;
}

const PAGE_SIZE = 50;
const UNKNOWN_BUILDING = "건물 미확인";

const costTypeLabels: Record<NonNullable<ManagerTransactionLedgerRow["cost"]>["type"], string> = {
  repair: "수리비",
  maintenance: "유지보수비",
  common: "공용 비용",
  other: "기타 비용",
};

function latestMonthOf(rows: ManagerTransactionLedgerRow[]): string {
  let latest = "";
  for (const row of rows) {
    const month = row.occurredAt.slice(0, 7);
    if (month > latest) latest = month;
  }
  return latest || "all";
}

export function ManagerTransactionLedger({ ledgerData }: ManagerTransactionLedgerProps) {
  const rows = useMemo(
    () => [...ledgerData.rows].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [ledgerData.rows],
  );
  const [building, setBuilding] = useState("all");
  const [unit, setUnit] = useState("all");
  const [month, setMonth] = useState(() => latestMonthOf(ledgerData.rows));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const buildings = useMemo(
    () =>
      Array.from(new Set(rows.map(buildingLabel))).sort((left, right) =>
        left.localeCompare(right, "ko"),
      ),
    [rows],
  );
  const units = useMemo(
    () =>
      Array.from(
        new Map(
          rows
            .filter((row) => building === "all" || buildingLabel(row) === building)
            .map((row) => [unitFilterKey(row), unitLabel(row)]),
        ).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1], "ko", { numeric: true })),
    [building, rows],
  );
  const months = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.occurredAt.slice(0, 7)))).sort((left, right) =>
        right.localeCompare(left),
      ),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return rows.filter((row) => {
      if (building !== "all" && buildingLabel(row) !== building) return false;
      if (unit !== "all" && unitFilterKey(row) !== unit) return false;
      if (month !== "all" && !row.occurredAt.startsWith(month)) return false;
      if (!normalizedQuery) return true;
      return [
        directionLabel(row),
        row.statusLabel,
        row.buildingName,
        row.unitId,
        row.candidateUnitId,
        row.partyName,
        row.depositorName,
        row.itemLabel,
        row.linkedBill?.tenantName,
        row.linkedBill?.billingMonth,
        ...(row.linkedBill?.items.map((item) => item.label) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko")
        .includes(normalizedQuery);
    });
  }, [building, month, query, rows, unit]);

  const { depositTotal, withdrawalTotal } = useMemo(() => {
    let deposit = 0;
    let withdrawal = 0;
    for (const row of visibleRows) {
      if (row.direction === "deposit") deposit += row.amount;
      else withdrawal += row.amount;
    }
    return { depositTotal: deposit, withdrawalTotal: withdrawal };
  }, [visibleRows]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, visibleRows],
  );
  const allPagedSelected = pagedRows.length > 0 && pagedRows.every((row) => selected.has(row.id));

  function changeBuilding(value: string) {
    setBuilding(value);
    setUnit("all");
    setPage(1);
  }

  function toggleAllPaged() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPagedSelected) pagedRows.forEach((row) => next.delete(row.id));
      else pagedRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportVisibleRows() {
    const headers = [
      "구분",
      "상태",
      "건물명",
      "확정 호실",
      "확인 후보 호실",
      "임차인/지급처",
      "거래일",
      "입금자명",
      "항목",
      "금액",
      "청구월",
      "납부기한",
    ];
    const csvRows = visibleRows.map((row) => [
      directionLabel(row),
      row.statusLabel,
      row.buildingName ?? "",
      row.unitId ?? "",
      row.candidateUnitId ?? "",
      row.partyName ?? "",
      row.occurredAt.slice(0, 10),
      row.depositorName ?? "",
      row.itemLabel,
      row.amount,
      row.linkedBill?.billingMonth ?? "",
      row.linkedBill?.dueDate ? formatBillingDate(row.linkedBill.dueDate) : "",
    ]);
    const csv = [headers, ...csvRows]
      .map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `입출금내역-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`현재 조회 결과 ${visibleRows.length}건을 내보냈습니다.`);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice(`${file.name} 파일을 선택했습니다. 업로드 검증 후 반영할 수 있습니다.`);
    event.target.value = "";
  }

  return (
    <section className={styles.ledger} aria-labelledby="transaction-ledger-title">
      <div className={styles.tabBar}>
        <span id="transaction-ledger-title">입출금 내역</span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>건물 선택</span>
            <select value={building} onChange={(event) => changeBuilding(event.target.value)}>
              <option value="all">건물 전체</option>
              {buildings.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>호실 선택</span>
            <select
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">호실 전체</option>
              {units.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>조회 월 선택</span>
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">전체 기간</option>
              {months.map((item) => (
                <option key={item} value={item}>{formatMonth(item)}</option>
              ))}
            </select>
          </label>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>입출금 내역 검색</span>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="임차인명 또는 호실 검색"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.ghostButton} onClick={() => uploadRef.current?.click()}>
            <Upload aria-hidden="true" />
            업로드
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className={styles.hiddenInput}
            onChange={handleUpload}
          />
          <button type="button" className={styles.ghostButton} onClick={exportVisibleRows}>
            <Download aria-hidden="true" />
            내보내기
          </button>
        </div>
      </div>

      {ledgerData.source === "demo" ? (
        <div className={styles.notice} role="status">
          데모 데이터입니다. API 연결 시 실제 입출금 원장으로 전환됩니다.
        </div>
      ) : null}
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="알림 닫기">×</button>
        </div>
      ) : null}

      <div className={styles.tableFrame}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  aria-label="현재 페이지 전체 선택"
                  checked={allPagedSelected}
                  onChange={toggleAllPaged}
                />
              </th>
              <th>구분</th>
              <th>건물 · 호실</th>
              <th>임차인/지급처</th>
              <th>거래일</th>
              <th>항목</th>
              <th className={styles.amountHeader}>금액</th>
              <th className={styles.expandHeader}><span className={styles.srOnly}>상세</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>조건에 맞는 입출금 내역이 없습니다.</td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <TransactionRow
                    key={row.id}
                    row={row}
                    checked={selected.has(row.id)}
                    expanded={expanded}
                    onToggle={() => toggleRow(row.id)}
                    onExpand={() => setExpandedId(expanded ? null : row.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableFooter}>
        <span>
          총 {visibleRows.length}건 · 입금 {formatWon(depositTotal)} · 출금 {formatWon(withdrawalTotal)}
          {" · "}순액 {signedWon(depositTotal - withdrawalTotal)}
        </span>
        <div className={styles.footerRight}>
          <span>선택 {selected.size}건</span>
          {pageCount > 1 ? (
            <div className={styles.pager}>
              <button
                type="button"
                aria-label="이전 페이지"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span>{safePage} / {pageCount} 페이지</span>
              <button
                type="button"
                aria-label="다음 페이지"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TransactionRow({
  row,
  checked,
  expanded,
  onToggle,
  onExpand,
}: {
  row: ManagerTransactionLedgerRow;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const isDeposit = row.direction === "deposit";
  const location = `${buildingLabel(row)} ${unitLabel(row)}`;
  const party = row.partyName ?? (isDeposit ? "임차인 미확인" : "지급처 정보 없음");
  const statusClass = statusClassName(row.statusLabel);

  return (
    <>
      <tr className={checked ? styles.selectedRow : undefined}>
        <td className={styles.checkboxCell}>
          <input
            type="checkbox"
            aria-label={`${location} 내역 선택`}
            checked={checked}
            onChange={onToggle}
          />
        </td>
        <td>
          <div className={styles.directionCell}>
            <span className={isDeposit ? styles.directionText : styles.directionOutText}>
              {directionLabel(row)}
            </span>
            {row.statusLabel && row.statusLabel !== "매칭 완료" ? (
              <span className={`${styles.statusBadge} ${statusClass}`}>{row.statusLabel}</span>
            ) : null}
          </div>
        </td>
        <td className={styles.strongCell}>
          {buildingLabel(row)} <span className={styles.unitText}>{unitLabel(row)}</span>
        </td>
        <td>{party}</td>
        <td className={styles.mutedCell}>{row.occurredAt.slice(0, 10)}</td>
        <td className={styles.mutedCell}>{row.itemLabel}</td>
        <td className={`${styles.amountCell} ${styles.totalAmount}`}>
          {isDeposit ? formatWon(row.amount) : `−${formatWon(row.amount)}`}
        </td>
        <td className={styles.expandCell}>
          <button
            type="button"
            className={`${styles.expandButton} ${expanded ? styles.expanded : ""}`}
            aria-label={`${location} 상세 ${expanded ? "접기" : "열기"}`}
            aria-expanded={expanded}
            onClick={onExpand}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className={styles.detailRow}>
          <td colSpan={8}>
            <div className={styles.detailContent}>
              {isDeposit ? <DepositDetail row={row} /> : <WithdrawalDetail row={row} />}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DepositDetail({ row }: { row: ManagerTransactionLedgerRow }) {
  const bill = row.linkedBill;
  const unpaidAmount = bill
    ? Math.max(0, bill.totalAmount - bill.paidAmount)
    : undefined;

  return (
    <>
      <section className={styles.detailGroup}>
        <h3 className={styles.detailGroupTitle}>입금 정보</h3>
        <dl className={styles.detailFields} data-columns="4">
          <DetailField label="입금자">{row.depositorName ?? "정보 없음"}</DetailField>
          <DetailField label="입금일시">{formatTransactionDateTime(row.occurredAt)}</DetailField>
          <DetailField label="이번 입금">{formatWon(row.amount)}</DetailField>
          <DetailField label="처리 상태">{transactionLedgerStatusLabel(row)}</DetailField>
        </dl>
      </section>
      {bill ? (
        <section className={styles.detailGroup}>
          <h3 className={styles.detailGroupTitle}>청구 정보</h3>
          <dl className={styles.detailFields} data-columns="6">
            <DetailField label="청구월">{formatMonth(bill.billingMonth)}</DetailField>
            <DetailField label="청구 내역">
              {bill.items.length > 0
                ? (
                  <span className={styles.billItems}>
                    {bill.items.map((item, index) => (
                      <span key={`${item.label}-${index}`} className={styles.billItem}>
                        {formatBillItem(item)}
                      </span>
                    ))}
                  </span>
                )
                : "항목 정보 없음"}
            </DetailField>
            <DetailField label="납부기한">{formatBillingDate(bill.dueDate)}</DetailField>
            <DetailField label="청구금액">{formatWon(bill.totalAmount)}</DetailField>
            <DetailField label="누적 수납">{formatWon(bill.paidAmount)}</DetailField>
            <DetailField label="미수금">{formatWon(unpaidAmount ?? 0)}</DetailField>
          </dl>
        </section>
      ) : (
        <section className={styles.detailGroup}>
          <h3 className={styles.detailGroupTitle}>청구 정보</h3>
          <dl className={styles.detailFields} data-columns="4">
            <DetailField label="청구 내역">확인 필요</DetailField>
            {row.candidateUnitId ? (
              <DetailField label="확인할 호실">{formatUnit(row.candidateUnitId)}</DetailField>
            ) : null}
          </dl>
        </section>
      )}
    </>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detailField}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function WithdrawalDetail({ row }: { row: ManagerTransactionLedgerRow }) {
  if (row.source === "credit_vendor_payout") {
    return (
      <section className={styles.detailGroup}>
        <h3 className={styles.detailGroupTitle}>출금 정보</h3>
        <dl className={styles.detailFields} data-columns="4">
          <DetailField label="원장 구분">크레딧 원장 · 업체 지급</DetailField>
          <DetailField label="지급 업체">{row.partyName ?? "업체 정보 없음"}</DetailField>
          <DetailField label="처리 상태">{row.statusLabel}</DetailField>
        </dl>
      </section>
    );
  }

  const cost = row.cost;
  if (!cost) {
    return (
      <section className={styles.detailGroup}>
        <h3 className={styles.detailGroupTitle}>출금 정보</h3>
        <dl className={styles.detailFields} data-columns="4">
          <DetailField label="원장 구분">확정 비용 정보 없음</DetailField>
        </dl>
      </section>
    );
  }
  return (
    <section className={styles.detailGroup}>
      <h3 className={styles.detailGroupTitle}>출금 정보</h3>
      <dl className={styles.detailFields} data-columns="6">
        <DetailField label="원장 구분">확정 비용 원장</DetailField>
        <DetailField label="비용 유형">{costTypeLabels[cost.type]}</DetailField>
        <DetailField label="적용 범위">{cost.scope === "unit" ? "호실" : "건물"}</DetailField>
        <DetailField label="검증 상태">{cost.verified ? "검증 완료" : "미검증"}</DetailField>
        <DetailField label="증빙">{cost.evidenceAvailable ? "증빙 있음" : "증빙 없음"}</DetailField>
        <DetailField label="원장 상태">{cost.status === "amended" ? "정정 확정" : "확정"}</DetailField>
      </dl>
    </section>
  );
}

function directionLabel(row: ManagerTransactionLedgerRow): "입금" | "출금" {
  return row.direction === "deposit" ? "입금" : "출금";
}

function buildingLabel(row: ManagerTransactionLedgerRow): string {
  return row.buildingName ?? UNKNOWN_BUILDING;
}

function unitFilterKey(row: ManagerTransactionLedgerRow): string {
  if (row.unitId) return `unit:${row.unitId}`;
  if (row.candidateUnitId) return `candidate:${row.candidateUnitId}`;
  return "unknown";
}

function unitLabel(row: ManagerTransactionLedgerRow): string {
  if (row.unitId) return formatUnit(row.unitId);
  if (row.candidateUnitId) return `후보 ${formatUnit(row.candidateUnitId)}`;
  return "호실 미확인";
}

function statusClassName(statusLabel: string): string {
  if (statusLabel.includes("불일치") || statusLabel.includes("미검증")) return styles.status_mismatch;
  if (statusLabel.includes("미연결")) return styles.status_orphan;
  return styles.status_unmatched;
}

function formatUnit(unit: string): string {
  return /^\d/.test(unit) ? `${unit}호` : unit;
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatBillItem(item: { label: string; amount: number }): string {
  return `${item.label} ${formatWon(item.amount)}`;
}

function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function signedWon(amount: number): string {
  if (amount < 0) return `−${formatWon(Math.abs(amount))}`;
  return formatWon(amount);
}
