"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ManagerCollectionAnalytics } from "@roomlog/types";
import {
  billingMonthDayCount,
  collectionPerformanceRows,
  shiftBillingMonth,
  timingAxisLabel,
  type CollectionPerformanceOrder,
} from "@/lib/billing-manager-workspace";
import styles from "./billing-workspace.module.css";

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function deltaLabel(value?: number) {
  if (value === undefined) return "비교 데이터 없음";
  const point = Math.abs(value * 100).toFixed(1);
  return `${value > 0 ? "+" : value < 0 ? "-" : "±"}${point}%p`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return year && monthNumber ? `${year}년 ${Number(monthNumber)}월` : month;
}

function unitRate(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function RateDelta({ value, prefix }: { value: number; prefix: string }) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={`${styles.delta} ${
        positive ? styles.positive : negative ? styles.negative : styles.muted
      }`}
    >
      {positive ? (
        <TrendingUp aria-hidden="true" size={14} />
      ) : negative ? (
        <TrendingDown aria-hidden="true" size={14} />
      ) : null}
      {prefix} {deltaLabel(value)}
    </span>
  );
}

type HistoryPreset = "3" | "6" | "12" | "custom";

const HISTORY_PRESETS = [
  { value: "3", months: 3, label: "3개월" },
  { value: "6", months: 6, label: "6개월" },
  { value: "12", months: 12, label: "12개월" },
] as const;

function historyPreset(value?: string): HistoryPreset {
  return value === "3" || value === "12" || value === "custom" ? value : "6";
}

function historyOrder(value?: string): CollectionPerformanceOrder {
  return value === "asc" ? "asc" : "desc";
}

export function CollectionWorkspace({
  data,
  historyPreset: initialPreset,
  historyOrder: initialOrder,
}: {
  data: ManagerCollectionAnalytics;
  historyPreset?: string;
  historyOrder?: string;
}) {
  const router = useRouter();
  const selectedPreset = historyPreset(initialPreset);
  const selectedOrder = historyOrder(initialOrder);
  const [historyFrom, setHistoryFrom] = useState(data.history.appliedFromMonth);
  const [historyTo, setHistoryTo] = useState(data.history.appliedToMonth);
  const [historyError, setHistoryError] = useState("");
  const scopeLabel = data.scope.selectedBuilding ?? "전체 건물";
  const fullyPaidRate = unitRate(data.brief.fullyPaidUnits, data.brief.billedUnits);
  const partiallyPaidRate = unitRate(
    data.brief.partiallyPaidUnits,
    data.brief.billedUnits,
  );
  const threeMonthDelta =
    data.brief.collectionRate - data.brief.threeMonthAverageRate;
  const sixMonthDelta = data.brief.collectionRate - data.brief.sixMonthAverageRate;
  const timingPoints = data.timing.points;
  const lastTimingDay = billingMonthDayCount(data.timing.currentMonth);
  const visibleTimingPoints = timingPoints.filter((point) => point.day <= lastTimingDay);
  const previousTimingRecorded = visibleTimingPoints.some(
    (point) => point.previousCumulativeAmount > 0,
  );
  const day10 = visibleTimingPoints[9]?.currentCumulativeAmount ?? 0;
  const day20 = visibleTimingPoints[19]?.currentCumulativeAmount ?? day10;
  const dayEnd =
    visibleTimingPoints[visibleTimingPoints.length - 1]?.currentCumulativeAmount ?? day20;
  const timingBuckets = [
    { label: "1~10일", amount: day10 },
    { label: "11~20일", amount: Math.max(0, day20 - day10) },
    { label: "21일 이후", amount: Math.max(0, dayEnd - day20) },
  ];
  const timingMax = Math.max(
    1,
    ...visibleTimingPoints.flatMap((point) => [
      point.currentCumulativeAmount,
      point.previousCumulativeAmount,
    ]),
  );
  const performanceRows = collectionPerformanceRows(data.trend, selectedOrder);
  const hasHistory = performanceRows.length > 0;

  useEffect(() => {
    setHistoryFrom(data.history.appliedFromMonth);
    setHistoryTo(data.history.appliedToMonth);
    setHistoryError("");
  }, [data.history.appliedFromMonth, data.history.appliedToMonth]);

  function navigateHistory(
    from: string,
    to: string,
    preset: HistoryPreset,
    order = selectedOrder,
  ) {
    const params = new URLSearchParams();
    if (data.scope.selectedBuilding) params.set("building", data.scope.selectedBuilding);
    params.set("month", data.billingMonth);
    params.set("historyFrom", from);
    params.set("historyTo", to);
    params.set("historyPreset", preset);
    params.set("order", order);
    router.push(`/manager/billing/collection?${params.toString()}`, { scroll: false });
  }

  function selectPreset(months: 3 | 6 | 12) {
    if (!hasHistory) return;
    const requestedFrom = shiftBillingMonth(
      data.history.availableToMonth,
      -(months - 1),
    );
    const from =
      requestedFrom < data.history.availableFromMonth
        ? data.history.availableFromMonth
        : requestedFrom;
    navigateHistory(
      from,
      data.history.availableToMonth,
      String(months) as HistoryPreset,
    );
  }

  function applyCustomRange() {
    if (!historyFrom || !historyTo) {
      setHistoryError("시작 월과 종료 월을 모두 선택해주세요.");
      return;
    }
    if (historyFrom > historyTo) {
      setHistoryError("시작 월은 종료 월보다 늦을 수 없습니다.");
      return;
    }
    setHistoryError("");
    navigateHistory(historyFrom, historyTo, "custom");
  }

  function selectOrder(order: CollectionPerformanceOrder) {
    if (!hasHistory) return;
    navigateHistory(
      data.history.appliedFromMonth,
      data.history.appliedToMonth,
      selectedPreset,
      order,
    );
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>수금 성과 진단</p>
            <h2 className={styles.sectionTitle}>{scopeLabel} · {monthLabel(data.billingMonth)}</h2>
          </div>
          <span className={styles.sectionMeta}>
            확인 중 {won(data.brief.confirmingAmount)} 제외
          </span>
        </div>

        <div className={styles.collectionDiagnosisGrid}>
          <div className={styles.diagnosisLead}>
            <span className={styles.metricLabel}>이번 달 수금률</span>
            <strong className={styles.diagnosisLeadValue}>
              {percent(data.brief.collectionRate)}
            </strong>
            <span className={styles.diagnosisAmount}>
              확정 {won(data.brief.collectedAmount)} / 청구 {won(data.brief.billedAmount)}
            </span>
          </div>
          <div className={styles.diagnosisItem}>
            <span className={styles.metricLabel}>최근 3개월 평균</span>
            <strong className={styles.diagnosisValue}>
              {percent(data.brief.threeMonthAverageRate)}
            </strong>
            <RateDelta value={threeMonthDelta} prefix="평균 대비" />
          </div>
          <div className={styles.diagnosisItem}>
            <span className={styles.metricLabel}>최근 6개월 평균</span>
            <strong className={styles.diagnosisValue}>
              {percent(data.brief.sixMonthAverageRate)}
            </strong>
            <RateDelta value={sixMonthDelta} prefix="평균 대비" />
          </div>
          <div className={styles.diagnosisItem}>
            <span className={styles.metricLabel}>완납 세대</span>
            <strong className={styles.diagnosisValue}>{percent(fullyPaidRate)}</strong>
            <span className={styles.muted}>
              {data.brief.fullyPaidUnits} / {data.brief.billedUnits}세대
            </span>
          </div>
          <div className={styles.diagnosisItem}>
            <span className={styles.metricLabel}>부분 수납 세대</span>
            <strong className={styles.diagnosisValue}>{percent(partiallyPaidRate)}</strong>
            <span className={styles.muted}>
              {data.brief.partiallyPaidUnits} / {data.brief.billedUnits}세대
            </span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.sectionHeader} ${styles.timingSectionHeader}`}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>수납 시점 분석</p>
            <h2 className={styles.sectionTitle}>월중 확정 수납 흐름</h2>
          </div>
          <div className={styles.legend} aria-label="누적 수납 그래프 범례">
            <span className={styles.legendItem}>
              <span className={styles.legendSwatch} data-kind="previous" />
              {monthLabel(data.timing.previousMonth)}
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendSwatch} data-kind="current" />
              {monthLabel(data.timing.currentMonth)}
            </span>
          </div>
        </div>

        <div className={styles.timingAnalysisGrid}>
          <div className={styles.timingSummary}>
            <div className={styles.timingSummaryTop}>
              <div>
                <span className={styles.metricLabel}>납부기한 전 수납 비율</span>
                <strong className={styles.timingSummaryValue}>
                  {percent(data.timing.onTimeCollectionRate)}
                </strong>
              </div>
              <div>
                <span className={styles.metricLabel}>평균 수납 완료일</span>
                <strong className={styles.timingSummaryValue}>
                  {data.timing.averageCollectionDay === undefined
                    ? "—"
                    : `${data.timing.averageCollectionDay.toFixed(1)}일`}
                </strong>
              </div>
            </div>
            <div className={styles.timingBuckets}>
              {timingBuckets.map((bucket) => (
                <div className={styles.timingBucket} key={bucket.label}>
                  <span>{bucket.label}</span>
                  <strong>{won(bucket.amount)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.timingChartPanel}>
            {!previousTimingRecorded ? (
              <p className={styles.timingRecordNotice}>
                {monthLabel(data.timing.previousMonth)} 수납 기록 없음
              </p>
            ) : null}
            <div
              className={styles.timingChart}
              aria-label="월중 누적 수납 비교"
              style={{
                gridTemplateColumns: `repeat(${visibleTimingPoints.length}, minmax(var(--space-xs), 1fr))`,
              }}
            >
              {visibleTimingPoints.map((point) => {
                const axisLabel = timingAxisLabel(point.day, lastTimingDay);
                const tooltip = [
                  `${point.day}일`,
                  `${monthLabel(data.timing.previousMonth)} ${won(point.previousCumulativeAmount)}`,
                  `${monthLabel(data.timing.currentMonth)} ${won(point.currentCumulativeAmount)}`,
                ].join(" · ");
                return (
                  <div
                    className={styles.timingColumn}
                    key={point.day}
                    tabIndex={0}
                    title={tooltip}
                    aria-label={tooltip}
                  >
                    <div className={styles.timingBars}>
                      <span
                        className={styles.timingPrevious}
                        style={{
                          height:
                            point.previousCumulativeAmount > 0
                              ? `${Math.max(4, (point.previousCumulativeAmount / timingMax) * 100)}%`
                              : "0%",
                        }}
                      />
                      <span
                        className={styles.timingCurrent}
                        style={{
                          height:
                            point.currentCumulativeAmount > 0
                              ? `${Math.max(4, (point.currentCumulativeAmount / timingMax) * 100)}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span
                      className={`${styles.timingDay} ${axisLabel ? styles.timingDayMajor : ""}`}
                    >
                      {timingAxisLabel(point.day, lastTimingDay)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>
              {hasHistory ? `${performanceRows.length}개월 월별 성과` : "수금 기록 없음"}
            </p>
            <h2 className={styles.sectionTitle}>수금 실적 변화</h2>
          </div>
          <div className={styles.historyControls}>
            <div className={styles.historyPresetRow} aria-label="실적 조회 기간">
              {HISTORY_PRESETS.map((preset) => (
                <button
                  type="button"
                  className={styles.periodButton}
                  aria-pressed={selectedPreset === preset.value}
                  disabled={!hasHistory}
                  key={preset.value}
                  onClick={() => selectPreset(preset.months)}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className={styles.periodButton}
                aria-pressed={selectedPreset === "custom"}
                disabled={!hasHistory}
                onClick={() =>
                  navigateHistory(
                    data.history.appliedFromMonth,
                    data.history.appliedToMonth,
                    "custom",
                  )
                }
              >
                직접 설정
              </button>
            </div>
            <div className={styles.historyOrder} aria-label="실적 정렬">
              <button
                type="button"
                className={styles.secondaryButton}
                aria-pressed={selectedOrder === "desc"}
                disabled={!hasHistory}
                onClick={() => selectOrder("desc")}
              >
                최근순
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                aria-pressed={selectedOrder === "asc"}
                disabled={!hasHistory}
                onClick={() => selectOrder("asc")}
              >
                과거순
              </button>
            </div>
          </div>
        </div>
        {selectedPreset === "custom" ? (
          <div className={styles.historyCustomPanel}>
            <div className={styles.historyCustomRange}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>시작 월</span>
                <input
                  className={styles.monthInput}
                  type="month"
                  min={data.history.availableFromMonth}
                  max={data.history.availableToMonth}
                  value={historyFrom}
                  disabled={!hasHistory}
                  onChange={(event) => setHistoryFrom(event.target.value)}
                />
              </label>
              <span className={styles.rangeSeparator} aria-hidden="true">~</span>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>종료 월</span>
                <input
                  className={styles.monthInput}
                  type="month"
                  min={data.history.availableFromMonth}
                  max={data.history.availableToMonth}
                  value={historyTo}
                  disabled={!hasHistory}
                  onChange={(event) => setHistoryTo(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!hasHistory}
                onClick={applyCustomRange}
              >
                적용
              </button>
            </div>
            {historyError ? <p className={styles.historyError}>{historyError}</p> : null}
          </div>
        ) : null}
        {performanceRows.length === 0 ? (
          <div className={styles.emptyState}>아직 표시할 수금 기록이 없습니다.</div>
        ) : (
          <div className={styles.monthlyPerformanceViewport}>
            <table className={styles.monthlyPerformanceTable}>
              <thead>
                <tr>
                  <th>청구월</th>
                  <th className={styles.numeric}>청구액</th>
                  <th className={styles.numeric}>확정 수납</th>
                  <th className={styles.numeric}>수금률</th>
                  <th className={styles.numeric}>완납 세대</th>
                  <th className={styles.numeric}>부분 수납</th>
                  <th className={styles.numeric}>전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {performanceRows.map((point) => {
                  const change = point.rateDelta;
                  return (
                    <tr key={point.billingMonth}>
                      <td>{monthLabel(point.billingMonth)}</td>
                      <td className={styles.numeric}>{won(point.billedAmount)}</td>
                      <td className={styles.numeric}>{won(point.collectedAmount)}</td>
                      <td className={styles.numeric}>{percent(point.collectionRate)}</td>
                      <td className={styles.numeric}>{point.fullyPaidUnits}세대</td>
                      <td className={styles.numeric}>{point.partiallyPaidUnits}세대</td>
                      <td
                        className={`${styles.numeric} ${
                          change === undefined || change >= 0
                            ? styles.positive
                            : styles.negative
                        }`}
                      >
                        {change === undefined ? "—" : deltaLabel(change)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
