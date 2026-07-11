"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import type { ManagerBillRow, ManagerCollectionAnalytics } from "@roomlog/types";
import {
  selectCollectionTrend,
  sortCollectionBuildings,
  type CollectionBuildingSort,
} from "@/lib/billing-manager-workspace";
import styles from "./billing-workspace.module.css";

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function compactWon(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
  return value.toLocaleString("ko-KR");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function deltaLabel(value?: number) {
  if (value === undefined) return "비교 데이터 없음";
  const point = Math.abs(value * 100).toFixed(1);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${point}%p`;
}

function DetailTable({ bills }: { bills: ManagerBillRow[] }) {
  if (!bills.length) return <div className={styles.emptyState}>선택 월의 호실별 청구가 없습니다.</div>;
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
            <th aria-label="상세" />
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => {
            const unpaid = bill.unpaidAmount ?? Math.max(0, bill.totalAmount - bill.paidAmount);
            return (
              <tr key={bill.billId}>
                <td>{bill.unitId}호</td>
                <td>{bill.tenantName}</td>
                <td className={styles.numeric}>{won(bill.totalAmount)}</td>
                <td className={styles.numeric}>{won(bill.paidAmount)}</td>
                <td className={`${styles.numeric} ${unpaid ? styles.unpaid : ""}`}>{won(unpaid)}</td>
                <td>
                  <span className={styles.statusPill} data-state={bill.status}>
                    {bill.status === "paid" ? "수납 완료" : bill.status === "overdue" ? "연체" : bill.status === "confirming" ? "확인 중" : "수납 중"}
                  </span>
                </td>
                <td className={styles.numeric}>
                  <Link className={styles.textLink} href={`/manager/billing/${encodeURIComponent(bill.billId)}`}>
                    상세
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionWorkspace({ data }: { data: ManagerCollectionAnalytics }) {
  const [period, setPeriod] = useState<3 | 6 | 12>(6);
  const [sort, setSort] = useState<CollectionBuildingSort>("unpaid_desc");
  const [expandedBuilding, setExpandedBuilding] = useState<string | undefined>(
    data.scope.selectedBuilding,
  );
  const trend = useMemo(() => selectCollectionTrend(data.trend, period), [data.trend, period]);
  const buildings = useMemo(() => sortCollectionBuildings(data.buildings, sort), [data.buildings, sort]);
  const maxAmount = Math.max(1, ...trend.map((point) => point.billedAmount));
  const delta = data.brief.rateDelta;

  return (
    <>
      <div className={styles.briefGrid} aria-label={`${data.billingMonth} 수금 브리프`}>
        <div className={styles.briefLead}>
          <div className={styles.metricLabel}>수금률</div>
          <div className={styles.briefLeadValue}>{percent(data.brief.collectionRate)}</div>
          <span className={`${styles.delta} ${(delta ?? 0) >= 0 ? styles.positive : styles.negative}`}>
            {(delta ?? 0) >= 0 ? <TrendingUp aria-hidden="true" size={14} /> : <TrendingDown aria-hidden="true" size={14} />}
            전월 대비 {deltaLabel(delta)}
          </span>
        </div>
        <div className={styles.briefItem}>
          <div className={styles.metricLabel}>확정 수납</div>
          <div className={styles.metricValue} data-tone="success">{won(data.brief.collectedAmount)}</div>
          <div className={styles.muted}>청구 {won(data.brief.billedAmount)}</div>
        </div>
        <div className={styles.briefItem}>
          <div className={styles.metricLabel}>전월 수금률</div>
          <div className={styles.metricValue}>{data.brief.previousCollectionRate === undefined ? "—" : percent(data.brief.previousCollectionRate)}</div>
          <div className={styles.muted}>같은 범위 비교</div>
        </div>
        <div className={styles.briefItem}>
          <div className={styles.metricLabel}>미수금</div>
          <div className={styles.metricValue} data-tone="danger">{won(data.brief.unpaidAmount)}</div>
          <div className={styles.muted}>확인 중 금액 제외</div>
        </div>
        <div className={styles.briefItem}>
          <div className={styles.metricLabel}>확인 중 금액</div>
          <div className={styles.metricValue}>{won(data.brief.confirmingAmount)}</div>
          <div className={styles.muted}>확정 수납 집계 전</div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>기간 추이</p>
            <h2 className={styles.sectionTitle}>청구액과 확정 수납액</h2>
          </div>
          <div className={styles.actionRow} aria-label="추이 기간">
            {([3, 6, 12] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={styles.periodButton}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value}개월
              </button>
            ))}
          </div>
        </div>
        <div className={styles.chartArea}>
          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.legendSwatch} />청구액</span>
            <span className={styles.legendItem}><span className={styles.legendSwatch} data-kind="paid" />확정 수납</span>
          </div>
          {trend.length ? (
            <div
              className={styles.chart}
              aria-label={`${period}개월 수금 추이`}
              style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(var(--space-xl), 1fr))` }}
            >
              {trend.map((point) => (
                <div className={styles.chartColumn} key={point.billingMonth} title={`${point.billingMonth}: 청구 ${won(point.billedAmount)}, 확정 ${won(point.collectedAmount)}`}>
                  <div className={styles.chartBars}>
                    <span className={styles.chartBill} style={{ height: point.billedAmount > 0 ? `${Math.max(3, (point.billedAmount / maxAmount) * 100)}%` : "0%" }} />
                    <span className={styles.chartPaid} style={{ height: point.collectedAmount > 0 ? `${Math.max(3, (point.collectedAmount / maxAmount) * 100)}%` : "0%" }} />
                  </div>
                  <span className={styles.chartLabel}>{point.billingMonth.slice(5)}월</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>표시할 실제 추이 데이터가 없습니다.</div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>건물 성과</p>
            <h2 className={styles.sectionTitle}>{data.billingMonth} 건물별 수금 현황</h2>
          </div>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>정렬</span>
            <select className={styles.compactSelect} value={sort} onChange={(event) => setSort(event.target.value as CollectionBuildingSort)}>
              <option value="unpaid_desc">미수금 많은 순</option>
              <option value="rate_asc">수금률 낮은 순</option>
              <option value="rate_desc">수금률 높은 순</option>
              <option value="building_asc">건물명 순</option>
            </select>
          </label>
        </div>

        {buildings.length ? (
          buildings.map((building) => {
            const expanded = expandedBuilding === building.buildingName;
            return (
              <div className={styles.performanceRow} key={building.buildingName}>
                <button
                  type="button"
                  className={styles.buildingButton}
                  aria-expanded={expanded}
                  onClick={() => setExpandedBuilding(expanded ? undefined : building.buildingName)}
                >
                  <span className={styles.buildingName}>
                    {expanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
                    <span>{building.buildingName}<br /><span className={styles.muted}>{building.roomCount}호실 · {building.address}</span></span>
                  </span>
                  <span className={styles.buildingMetric}>청구 {compactWon(building.billedAmount)}</span>
                  <span className={`${styles.buildingMetric} ${styles.unpaid}`}>미수 {compactWon(building.unpaidAmount)}</span>
                  <span className={styles.buildingMetric}>
                    {percent(building.collectionRate)}<br />
                    <span className={(building.rateDelta ?? 0) >= 0 ? styles.positive : styles.negative}>{deltaLabel(building.rateDelta)}</span>
                  </span>
                  {expanded ? <span className={styles.detailBadge}>상세 열림</span> : <span aria-hidden="true" />}
                </button>
                {expanded ? (
                  <div className={styles.expandedDetail}>
                    <DetailTable bills={building.bills} />
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className={styles.emptyState}>선택 범위에 건물별 수금 데이터가 없습니다.</div>
        )}
      </section>
    </>
  );
}
