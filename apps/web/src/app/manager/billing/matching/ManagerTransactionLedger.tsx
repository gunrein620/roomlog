"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Deposit, ManagerBillRow } from "@roomlog/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Upload,
} from "lucide-react";
import styles from "./manager-transaction-ledger.module.css";

interface ManagerTransactionLedgerProps {
  deposits: Deposit[];
  bills: ManagerBillRow[];
}

type ChargeKind =
  | "월세+관리비"
  | "월세"
  | "관리비"
  | "보증금"
  | "수리비"
  | "유지보수"
  | "보증금 반환";

interface LedgerRow {
  id: string;
  direction: "입금" | "출금";
  status: Deposit["matchStatus"] | null;
  statusLabel: string;
  building: string;
  unit: string;
  counterparty: string;
  transactionDate: string;
  depositorName: string;
  chargeKind: ChargeKind;
  depositAmount: number;
  rentAmount: number;
  maintenanceAmount: number;
  totalAmount: number;
  leasePeriod?: string;
  memo: string;
  matchedBillId?: string;
  linkedComplaint?: string;
}

const fallbackNames = [
  "오세훈",
  "신동현",
  "정미래",
  "김나래",
  "윤가온",
  "조시우",
  "유준서",
  "나봄",
  "이서연",
  "박지윤",
  "장민수",
  "김도현",
  "강하늘",
  "임준호",
  "한지민",
] as const;

const leasePeriods = [
  "2026-07-01 ~ 2026-07-31",
  "2026-06-25 ~ 2026-07-24",
  "2026-06-19 ~ 2026-07-18",
  "2026-06-18 ~ 2026-07-17",
  "2026-06-15 ~ 2026-07-14",
] as const;

const statusLabels: Record<Deposit["matchStatus"], string> = {
  matched: "매칭 완료",
  unmatched: "확인 필요",
  orphan: "미연결",
  mismatch: "불일치",
};

const PAGE_SIZE = 50;

function latestMonthOf(deposits: Deposit[]): string {
  let latest = "";
  for (const deposit of deposits) {
    const month = deposit.depositedAt.slice(0, 7);
    if (month > latest) latest = month;
  }
  return latest || "all";
}

export function ManagerTransactionLedger({ deposits, bills }: ManagerTransactionLedgerProps) {
  const rows = useMemo(() => {
    const depositRows = buildLedgerRows(deposits, bills);
    const withdrawalRows = buildWithdrawalRows(latestMonthOf(deposits));
    return [...depositRows, ...withdrawalRows].sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate)
    );
  }, [deposits, bills]);
  const [building, setBuilding] = useState("all");
  const [unit, setUnit] = useState("all");
  const [month, setMonth] = useState(() => latestMonthOf(deposits));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const buildings = useMemo(
    () => Array.from(new Set(rows.map((row) => row.building))).sort((a, b) => a.localeCompare(b, "ko")),
    [rows]
  );
  const units = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => building === "all" || row.building === building)
            .map((row) => row.unit)
        )
      ).sort((a, b) => a.localeCompare(b, "ko", { numeric: true })),
    [building, rows]
  );
  const months = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.transactionDate.slice(0, 7)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return rows.filter((row) => {
      if (building !== "all" && row.building !== building) return false;
      if (unit !== "all" && row.unit !== unit) return false;
      if (month !== "all" && !row.transactionDate.startsWith(month)) return false;
      if (!normalizedQuery) return true;
      return [
        row.direction,
        row.building,
        row.unit,
        row.counterparty,
        row.depositorName,
        row.chargeKind,
        row.statusLabel,
        row.memo,
      ]
        .join(" ")
        .toLocaleLowerCase("ko")
        .includes(normalizedQuery);
    });
  }, [building, month, query, rows, unit]);

  const { depositTotal, withdrawalTotal } = useMemo(() => {
    let deposit = 0;
    let withdrawal = 0;
    for (const row of visibleRows) {
      if (row.direction === "입금") deposit += row.totalAmount;
      else withdrawal += row.totalAmount;
    }
    return { depositTotal: deposit, withdrawalTotal: withdrawal };
  }, [visibleRows]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, visibleRows]
  );

  const allPagedSelected =
    pagedRows.length > 0 && pagedRows.every((row) => selected.has(row.id));

  function changeBuilding(value: string) {
    setBuilding(value);
    setUnit("all");
    setPage(1);
  }

  function changeUnit(value: string) {
    setUnit(value);
    setPage(1);
  }

  function changeMonth(value: string) {
    setMonth(value);
    setPage(1);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function toggleAllPaged() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPagedSelected) {
        pagedRows.forEach((row) => next.delete(row.id));
      } else {
        pagedRows.forEach((row) => next.add(row.id));
      }
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
      "호실",
      "임차인/지급처",
      "거래일",
      "입금자명",
      "항목",
      "보증금",
      "월세",
      "관리비",
      "총액",
      "임대기간",
      "연결 청구서/민원",
      "메모",
    ];
    const csvRows = visibleRows.map((row) => [
      row.direction,
      row.statusLabel,
      row.building,
      row.unit,
      row.counterparty,
      row.transactionDate,
      row.depositorName,
      row.chargeKind,
      row.depositAmount,
      row.rentAmount,
      row.maintenanceAmount,
      row.totalAmount,
      row.leasePeriod ?? "",
      row.direction === "입금" ? row.matchedBillId ?? "" : row.linkedComplaint ?? "",
      row.memo,
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
            <select value={unit} onChange={(event) => changeUnit(event.target.value)}>
              <option value="all">호실 전체</option>
              {units.map((item) => (
                <option key={item} value={item}>{formatUnit(item)}</option>
              ))}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>조회 월 선택</span>
            <select value={month} onChange={(event) => changeMonth(event.target.value)}>
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
              onChange={(event) => changeQuery(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => uploadRef.current?.click()}
          >
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
                  <FragmentRow
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
          총 {visibleRows.length}건 · 입금 {depositTotal.toLocaleString("ko-KR")}원 · 출금 {withdrawalTotal.toLocaleString("ko-KR")}원
          · 순액 {(depositTotal - withdrawalTotal).toLocaleString("ko-KR")}원
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

function FragmentRow({
  row,
  checked,
  expanded,
  onToggle,
  onExpand,
}: {
  row: LedgerRow;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const isDeposit = row.direction === "입금";
  const depositorDiffers = isDeposit && row.depositorName !== row.counterparty;
  return (
    <>
      <tr className={checked ? styles.selectedRow : undefined}>
        <td className={styles.checkboxCell}>
          <input
            type="checkbox"
            aria-label={`${row.building} ${formatUnit(row.unit)} 내역 선택`}
            checked={checked}
            onChange={onToggle}
          />
        </td>
        <td>
          <div className={styles.directionCell}>
            <span className={isDeposit ? styles.directionText : styles.directionOutText}>
              {row.direction}
            </span>
            {row.status && row.status !== "matched" ? (
              <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                {row.statusLabel}
              </span>
            ) : null}
          </div>
        </td>
        <td className={styles.strongCell}>
          {row.building} <span className={styles.unitText}>{formatUnit(row.unit)}</span>
        </td>
        <td>{row.counterparty}</td>
        <td className={styles.mutedCell}>{row.transactionDate}</td>
        <td className={styles.mutedCell}>{row.chargeKind}</td>
        <td className={`${styles.amountCell} ${styles.totalAmount}`}>
          {isDeposit ? formatWon(row.totalAmount) : `−${formatWon(row.totalAmount)}`}
        </td>
        <td className={styles.expandCell}>
          <button
            type="button"
            className={`${styles.expandButton} ${expanded ? styles.expanded : ""}`}
            aria-label={`${row.building} ${formatUnit(row.unit)} 상세 ${expanded ? "접기" : "열기"}`}
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
            <div>
              {row.depositAmount > 0 ? (
                <span><strong>보증금</strong> {formatWon(row.depositAmount)}</span>
              ) : null}
              {row.rentAmount > 0 ? (
                <span><strong>월세</strong> {formatWon(row.rentAmount)}</span>
              ) : null}
              {row.maintenanceAmount > 0 ? (
                <span><strong>관리비</strong> {formatWon(row.maintenanceAmount)}</span>
              ) : null}
              {isDeposit ? (
                <span>
                  <strong>입금자</strong> {row.depositorName}
                  {depositorDiffers ? (
                    <span className={`${styles.statusBadge} ${styles.status_unmatched}`}>임차인과 다름</span>
                  ) : null}
                </span>
              ) : (
                <span><strong>지급처</strong> {row.counterparty}</span>
              )}
              {row.leasePeriod ? (
                <span><strong>임대기간</strong> {row.leasePeriod}</span>
              ) : null}
              {isDeposit ? (
                <span><strong>연결 청구서</strong> {row.matchedBillId ?? "아직 연결되지 않음"}</span>
              ) : (
                <span><strong>연결 민원</strong> {row.linkedComplaint ?? "연결 없음 (정기 지출)"}</span>
              )}
              <span><strong>메모</strong> {row.memo}</span>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function buildLedgerRows(deposits: Deposit[], bills: ManagerBillRow[]): LedgerRow[] {
  return deposits
    .map((deposit, index) => {
      const matchedBill = bills.find((bill) => bill.billId === deposit.matchedBillId);
      const unit = matchedBill?.unitId ?? deposit.guessedUnitId ?? inferUnit(deposit.matchedBillId, index);
      const tenantFallback = fallbackNames[index % fallbackNames.length];
      const tenantName = readableKorean(matchedBill?.tenantName, tenantFallback);
      const depositorName = readableKorean(deposit.depositorName, tenantName);
      const chargeKind = chargeKindFor(index, deposit);
      const amounts = splitAmount(deposit.amount, chargeKind);

      return {
        id: deposit.id,
        direction: "입금" as const,
        status: deposit.matchStatus,
        statusLabel: statusLabels[deposit.matchStatus],
        building: buildingFor(index),
        unit,
        counterparty: tenantName,
        transactionDate: deposit.depositedAt.slice(0, 10),
        depositorName,
        chargeKind,
        ...amounts,
        totalAmount: deposit.amount,
        leasePeriod: leasePeriods[index % leasePeriods.length],
        memo: memoFor(chargeKind, deposit.matchStatus, deposit.amount),
        matchedBillId: deposit.matchedBillId,
      };
    });
}

function buildWithdrawalRows(latestMonth: string): LedgerRow[] {
  if (latestMonth === "all") return [];
  const base = {
    direction: "출금" as const,
    status: null,
    statusLabel: "",
    depositorName: "",
    depositAmount: 0,
    rentAmount: 0,
    maintenanceAmount: 0,
  };
  return [
    {
      ...base,
      id: "wd-boiler-302",
      building: "세움타워",
      unit: "302",
      counterparty: "한빛설비",
      transactionDate: `${latestMonth}-08`,
      chargeKind: "수리비",
      totalAmount: 250_000,
      linkedComplaint: "302호 보일러 누수 (06-30 접수)",
      memo: "부품 교체 포함 출장 수리",
    },
    {
      ...base,
      id: "wd-paint-201",
      building: "그린오피스",
      unit: "201",
      counterparty: "조은도장",
      transactionDate: `${latestMonth}-12`,
      chargeKind: "수리비",
      totalAmount: 420_000,
      linkedComplaint: "201호 벽면 누수 도장 (07-02 접수)",
      memo: "방수 처리 후 재도장",
    },
    {
      ...base,
      id: "wd-elevator",
      building: "한빛스퀘어",
      unit: "공용",
      counterparty: "대성엘리베이터",
      transactionDate: `${latestMonth}-05`,
      chargeKind: "유지보수",
      totalAmount: 180_000,
      memo: "엘리베이터 정기점검",
    },
    {
      ...base,
      id: "wd-deposit-refund-105",
      building: "세움타워",
      unit: "105",
      counterparty: "김도현",
      transactionDate: `${latestMonth}-15`,
      chargeKind: "보증금 반환",
      totalAmount: 3_000_000,
      memo: "퇴실 정산 완료 후 반환",
    },
  ];
}

function formatUnit(unit: string): string {
  return /^\d/.test(unit) ? `${unit}호` : unit;
}

function inferUnit(billId: string | undefined, index: number): string {
  const matched = billId?.match(/(\d{3})(?!.*\d)/)?.[1];
  return matched ?? String(201 + index);
}

function buildingFor(index: number): string {
  const buildings = ["세움타워", "한빛스퀘어", "그린오피스"] as const;
  return buildings[index % buildings.length];
}

function readableKorean(value: string | undefined, fallback: string): string {
  return value && /[가-힣]/.test(value) ? value : fallback;
}

function chargeKindFor(index: number, deposit: Deposit): ChargeKind {
  if (deposit.amount >= 2_000_000) return "보증금";
  const kinds: ChargeKind[] = ["월세+관리비", "관리비", "월세", "월세+관리비"];
  return kinds[index % kinds.length];
}

function splitAmount(amount: number, kind: ChargeKind) {
  if (kind === "보증금") return { depositAmount: amount, rentAmount: 0, maintenanceAmount: 0 };
  if (kind === "관리비") return { depositAmount: 0, rentAmount: 0, maintenanceAmount: amount };
  if (kind === "월세") return { depositAmount: 0, rentAmount: amount, maintenanceAmount: 0 };
  const maintenanceAmount = Math.min(150_000, Math.max(50_000, Math.round(amount * 0.1 / 10_000) * 10_000));
  return { depositAmount: 0, rentAmount: amount - maintenanceAmount, maintenanceAmount };
}

function memoFor(kind: ChargeKind, status: Deposit["matchStatus"], amount: number): string {
  const amountText = `${amount.toLocaleString("ko-KR")}원`;
  if (status === "orphan") return `입금자 확인 필요 · ${amountText}`;
  if (status === "mismatch") return `청구 금액과 입금액 불일치 · ${amountText}`;
  if (kind === "보증금") return `계약 보증금 ${amountText}`;
  return `${kind.replace("+", " · ")} ${amountText}`;
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatWon(amount: number): string {
  return amount > 0 ? `${amount.toLocaleString("ko-KR")}원` : "—";
}
