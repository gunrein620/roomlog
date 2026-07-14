"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  WalletCards,
} from "lucide-react";
import type { ManagerBillRow } from "@roomlog/types";
import type { ManagerDashboardData } from "@/lib/billing-manager-api";
import {
  buildBillingScopeHref,
  filterDashboardBills,
  groupBillsByBuilding,
  managerBillDisplayState,
  managerBillStatusLabel,
  type DashboardBillSort,
  type DashboardQuickFilter,
  type DashboardReviewFilter,
} from "@/lib/billing-manager-workspace";
import styles from "./billing-workspace.module.css";

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function unpaid(bill: ManagerBillRow) {
  return bill.unpaidAmount ?? Math.max(0, bill.totalAmount - bill.paidAmount);
}

function LedgerTable({ bills }: { bills: ManagerBillRow[] }) {
  if (bills.length === 0) {
    return <div className={styles.emptyState}>조건에 맞는 청구가 없습니다.</div>;
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>호실</th>
            <th>임차인</th>
            <th className={styles.numeric}>청구액</th>
            <th className={styles.numeric}>확정 수납</th>
            <th className={styles.numeric}>미수금</th>
            <th>상태</th>
            <th>납부기한</th>
            <th aria-label="상세" />
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => (
            <tr key={bill.billId}>
              <td>{bill.unitId}호</td>
              <td>{bill.tenantName}</td>
              <td className={styles.numeric}>{won(bill.totalAmount)}</td>
              <td className={styles.numeric}>{won(bill.paidAmount)}</td>
              <td className={`${styles.numeric} ${unpaid(bill) > 0 ? styles.unpaid : ""}`}>
                {won(unpaid(bill))}
              </td>
              <td>
                <span className={styles.statusPill} data-state={managerBillDisplayState(bill)}>
                  {managerBillStatusLabel(bill)}
                </span>
              </td>
              <td>{bill.dueDate.slice(0, 10)}</td>
              <td className={styles.numeric}>
                <Link className={styles.textLink} href={`/manager/billing/${encodeURIComponent(bill.billId)}`}>
                  상세
                  <ChevronRight aria-hidden="true" size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillingDashboardWorkspace({ data }: { data: ManagerDashboardData }) {
  const [quick, setQuick] = useState<DashboardQuickFilter>("all");
  const [review, setReview] = useState<DashboardReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<DashboardBillSort>("unpaid_desc");
  const allGroups = useMemo(() => groupBillsByBuilding(data.bills), [data.bills]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allGroups.map((group) => group.buildingName)),
  );

  const visibleBills = useMemo(
    () => filterDashboardBills(data.bills, { quick, review, query, status, sort }),
    [data.bills, query, quick, review, sort, status],
  );
  const groups = useMemo(() => groupBillsByBuilding(visibleBills), [visibleBills]);
  const quickOptions: Array<{ key: DashboardQuickFilter; label: string; count: number }> = [
    { key: "all", label: "전체", count: data.bills.length },
    {
      key: "needs_review",
      label: "확인 필요",
      count: filterDashboardBills(data.bills, { quick: "needs_review" }).length,
    },
    {
      key: "paid",
      label: "수납 완료",
      count: filterDashboardBills(data.bills, { quick: "paid" }).length,
    },
    {
      key: "overdue",
      label: "연체",
      count: filterDashboardBills(data.bills, { quick: "overdue" }).length,
    },
  ];

  function toggleBuilding(buildingName: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(buildingName)) next.delete(buildingName);
      else next.add(buildingName);
      return next;
    });
  }

  function exportCsv() {
    const rows = [
      ["건물", "호실", "임차인", "청구월", "청구액", "확정수납", "미수금", "상태", "납부기한"],
      ...visibleBills.map((bill) => [
        bill.buildingName ?? "건물 확인 필요",
        bill.unitId,
        bill.tenantName,
        bill.billingMonth,
        bill.totalAmount,
        bill.paidAmount,
        unpaid(bill),
        managerBillStatusLabel(bill),
        bill.dueDate.slice(0, 10),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `청구원장-${data.billingMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const recent = data.recentDeposits[0];
  const overdue = data.overduePreview[0];
  const newBillHref = buildBillingScopeHref("/manager/billing/new", {
    building: data.scope.selectedBuilding,
    month: data.billingMonth,
  });

  return (
    <>
      <div className={styles.summaryStrip} aria-label={`${data.billingMonth} 청구 핵심 지표`}>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>총 청구액</div>
          <div className={styles.metricValue}>{won(data.summary.billedAmount)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>확정 수납</div>
          <div className={styles.metricValue} data-tone="success">
            {won(data.summary.collectedAmount)}
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>미수금</div>
          <div className={styles.metricValue} data-tone="danger">
            {won(data.summary.unpaidAmount)}
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>수금률</div>
          <div className={styles.metricValue}>{percent(data.summary.collectionRate)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>활성 연체 세대</div>
          <div className={styles.metricValue} data-tone={data.summary.overdueUnits ? "danger" : undefined}>
            {data.summary.overdueUnits}세대
          </div>
        </div>
      </div>

      <div className={styles.previewGrid}>
        <article className={styles.previewPanel}>
          <div className={styles.previewTop}>
            <h2 className={styles.previewTitle}>이번 달 수금</h2>
            <WalletCards aria-hidden="true" size={18} />
          </div>
          <div className={styles.previewValue}>{percent(data.summary.collectionRate)}</div>
          <div className={styles.previewFooter}>
            <span>{won(data.summary.collectedAmount)} 확정</span>
            <Link
              className={styles.textLink}
              href={buildBillingScopeHref("/manager/billing/collection", {
                building: data.scope.selectedBuilding,
                month: data.billingMonth,
              })}
            >
              분석 보기
              <ChevronRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </article>

        <article className={styles.previewPanel}>
          <div className={styles.previewTop}>
            <h2 className={styles.previewTitle}>최근 입금</h2>
            <span className={styles.smallPill}>{data.recentDeposits.length}건</span>
          </div>
          <div className={styles.previewValue}>{recent ? won(recent.amount) : "입금 없음"}</div>
          <div className={styles.previewFooter}>
            <span>
              {recent
                ? `${recent.depositorName} · ${recent.buildingName ?? "건물 확인 필요"} ${recent.unitId ?? ""}`
                : "선택 범위에 최근 입금이 없습니다."}
            </span>
            <Link className={styles.textLink} href="/manager/billing/matching">
              내역 보기
              <ChevronRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </article>

        <article className={styles.previewPanel}>
          <div className={styles.previewTop}>
            <h2 className={styles.previewTitle}>활성 연체</h2>
            <span className={styles.smallPill}>{data.summary.overdueUnits}세대</span>
          </div>
          <div className={`${styles.previewValue} ${overdue ? styles.unpaid : ""}`}>
            {overdue ? won(overdue.unpaidAmount) : "연체 없음"}
          </div>
          <div className={styles.previewFooter}>
            <span>{overdue ? `${overdue.buildingName} ${overdue.unitId}호 · ${overdue.daysOverdue}일` : "확인 대기 건은 제외했습니다."}</span>
            <Link
              className={styles.textLink}
              href={buildBillingScopeHref("/manager/billing/overdue", {
                building: data.scope.selectedBuilding,
              })}
            >
              관리하기
              <ChevronRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </article>
      </div>

      <div className={styles.filterStrip} aria-label="청구 빠른 필터">
        <div className={styles.toolbar}>
          {quickOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={styles.filterButton}
              aria-pressed={quick === option.key}
              onClick={() => {
                setQuick(option.key);
                if (option.key !== "needs_review") setReview("all");
              }}
            >
              {option.label}
              <span className={styles.filterCount}>{option.count}</span>
            </button>
          ))}
        </div>
        <span className={styles.tableCaption}>선택하면 아래 원장만 변경됩니다.</span>
      </div>

      {quick === "needs_review" ? (
        <div className={styles.secondaryFilters} aria-label="확인 필요 상세 필터">
          {[
            ["all", "전체"],
            ["payment_review", "납부 확인"],
            ["long_overdue", "장기 연체"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={styles.secondaryButton}
              aria-pressed={review === key}
              onClick={() => setReview(key as DashboardReviewFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>청구 원장</p>
            <h2 className={styles.sectionTitle}>{visibleBills.length}건의 청구</h2>
          </div>
          <div className={styles.tableTools}>
            <label className={styles.searchWrap}>
              <span className={styles.visuallyHidden}>청구 검색</span>
              <Search className={styles.searchIcon} aria-hidden="true" size={15} />
              <input
                className={styles.input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="건물, 호실, 임차인 검색"
              />
            </label>
            <label>
              <span className={styles.visuallyHidden}>세부 상태</span>
              <select className={styles.compactSelect} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">모든 상태</option>
                <option value="draft">초안</option>
                <option value="sent">수납 대기</option>
                <option value="confirming">납부 확인 중</option>
                <option value="payment_review">입금 확인 대기</option>
                <option value="partially_paid">일부 수납</option>
                <option value="paid">수납 완료</option>
                <option value="overdue">연체</option>
              </select>
            </label>
            <label>
              <span className={styles.visuallyHidden}>청구 정렬</span>
              <select className={styles.compactSelect} value={sort} onChange={(event) => setSort(event.target.value as DashboardBillSort)}>
                <option value="unpaid_desc">미수금 큰 순</option>
                <option value="due_asc">납부기한 순</option>
                <option value="unit_asc">호실 순</option>
                <option value="recent_desc">최신 청구 순</option>
              </select>
            </label>
            <button type="button" className={styles.iconButton} aria-label="현재 목록 CSV 내보내기" title="CSV 내보내기" onClick={exportCsv}>
              <Download aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {visibleBills.length === 0 ? (
          <div className={styles.emptyState}>
            <p>선택한 범위에 청구가 없습니다.</p>
            <Link className={styles.secondaryLink} href={newBillHref}>
              청구서 생성
            </Link>
          </div>
        ) : data.scope.selectedBuilding ? (
          <LedgerTable bills={visibleBills} />
        ) : (
          groups.map((group) => {
            const isExpanded = expanded.has(group.buildingName);
            return (
              <div className={styles.buildingGroup} key={group.buildingName}>
                <button
                  type="button"
                  className={styles.buildingButton}
                  aria-expanded={isExpanded}
                  onClick={() => toggleBuilding(group.buildingName)}
                >
                  <span className={styles.buildingName}>
                    {isExpanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
                    {group.buildingName}
                  </span>
                  <span className={styles.buildingMetric}>{group.bills.length}건</span>
                  <span className={styles.buildingMetric}>수납 {won(group.collectedAmount)}</span>
                  <span className={`${styles.buildingMetric} ${styles.unpaid}`}>미수 {won(group.unpaidAmount)}</span>
                  <span aria-hidden="true" />
                </button>
                {isExpanded ? <LedgerTable bills={group.bills} /> : null}
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
