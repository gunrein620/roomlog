"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Hourglass,
  ListChecks,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildComplaintDashboard,
  complaintCategory,
  complaintStatusLabel,
  formatComplaintDate,
  latestComplaintMonth,
  serializeComplaintDashboardCsv,
} from "./complaint-dashboard-model";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

const METRICS = [
  { id: "total", label: "전체 민원", icon: ListChecks },
  { id: "inProgress", label: "처리 중", icon: BarChart3 },
  { id: "waiting", label: "대기", icon: Hourglass },
  { id: "completed", label: "완료", icon: CheckCircle2 },
] as const;

const CATEGORY_COLORS = [
  "var(--primary)",
  "var(--warning)",
  "var(--on-surface-variant)",
  "var(--outline-variant)",
] as const;

function moveMonth(month: Date, amount: number) {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
}

function downloadCsv(rows: readonly DefectDashboardRow[], month: Date, monthLabel: string) {
  const content = `\uFEFF${serializeComplaintDashboardCsv(rows, month)}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `민원-대시보드-${monthLabel}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ComplaintDashboard({ rows }: { rows: readonly DefectDashboardRow[] }) {
  const [month, setMonth] = useState(() => latestComplaintMonth(rows));
  const dashboard = useMemo(() => buildComplaintDashboard(rows, month), [rows, month]);
  const maxTrendCount = Math.max(1, ...dashboard.trend.map((item) => item.count));
  const donutSegments = dashboard.categories.reduce<string[]>((segments, category, index) => {
    const start = dashboard.categories.slice(0, index).reduce((total, item) => total + item.percent, 0);
    const end = start + category.percent;
    segments.push(`${CATEGORY_COLORS[index]} ${start}% ${end}%`);
    return segments;
  }, []).join(", ");

  return (
    <section className="manager-complaint-dashboard" aria-labelledby="manager-complaint-title">
      <header className="manager-complaint-dashboard__header">
        <div>
          <h2 id="manager-complaint-title">민원 대시보드</h2>
          <p>민원 현황을 한눈에 확인하고 관리하세요.</p>
        </div>
        <div className="manager-complaint-dashboard__header-actions">
          <div className="manager-complaint-dashboard__period" aria-label="조회 기간">
            <CalendarDays aria-hidden="true" />
            <button type="button" aria-label="이전 달" onClick={() => setMonth((current) => moveMonth(current, -1))}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <span>{dashboard.monthLabel}</span>
            <button type="button" aria-label="다음 달" onClick={() => setMonth((current) => moveMonth(current, 1))}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="manager-complaint-dashboard__download"
            onClick={() => downloadCsv(rows, month, dashboard.monthLabel)}
          >
            <Download aria-hidden="true" />
            보고서 다운로드
          </button>
        </div>
      </header>

      <div className="manager-complaint-dashboard__metrics">
        {METRICS.map(({ id, label, icon: Icon }) => {
          const value = dashboard.summary[id];
          return (
            <article key={id} className="manager-complaint-dashboard__metric" data-metric={id}>
              <span className="manager-complaint-dashboard__metric-icon"><Icon aria-hidden="true" /></span>
              <span className="manager-complaint-dashboard__metric-label">{label}</span>
              <strong>{value}</strong>
              {id === "total" ? (
                <span className="manager-complaint-dashboard__metric-change" data-positive={dashboard.summary.change >= 0}>
                  {dashboard.summary.change >= 0 ? "↗" : "↘"} {Math.abs(dashboard.summary.change)}% 지난 달 대비
                </span>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="manager-complaint-dashboard__chart-grid">
        <article className="manager-complaint-dashboard__panel">
          <div className="manager-complaint-dashboard__panel-heading">
            <h3>민원 접수 현황</h3>
            <span>최근 6개월</span>
          </div>
          <div className="manager-complaint-dashboard__trend" role="img" aria-label="최근 6개월 민원 접수 건수">
            {dashboard.trend.map((item) => (
              <div key={item.label} className="manager-complaint-dashboard__trend-item">
                <span className="manager-complaint-dashboard__trend-count">{item.count}</span>
                <span
                  className="manager-complaint-dashboard__trend-bar"
                  data-current={item.current}
                  style={{ height: `${Math.max(6, (item.count / maxTrendCount) * 100)}%` }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="manager-complaint-dashboard__panel">
          <div className="manager-complaint-dashboard__panel-heading">
            <h3>민원 유형별 비율</h3>
          </div>
          <div className="manager-complaint-dashboard__distribution">
            <div
              className="manager-complaint-dashboard__donut"
              style={{ background: `conic-gradient(${donutSegments || "var(--outline-variant) 0 100%"})` }}
              role="img"
              aria-label={`총 ${dashboard.summary.total}건의 민원 유형별 비율`}
            >
              <div><strong>{dashboard.summary.total}</strong><span>총 접수</span></div>
            </div>
            <ul className="manager-complaint-dashboard__legend">
              {dashboard.categories.map((category, index) => (
                <li key={category.id}>
                  <span style={{ background: CATEGORY_COLORS[index] }} aria-hidden="true" />
                  {category.label} ({category.percent}%)
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>

      <article className="manager-complaint-dashboard__recent">
        <div className="manager-complaint-dashboard__panel-heading">
          <h3>최근 민원 접수 내역</h3>
          <Link href="/manager/ticket/dash/00?type=complaint">전체보기</Link>
        </div>
        <div className="manager-complaint-dashboard__recent-scroll">
          <table>
            <thead>
              <tr><th>유형</th><th>내용</th><th>건물/호실</th><th>접수일</th><th>상태</th></tr>
            </thead>
            <tbody>
              {dashboard.recent.map((row) => (
                <tr key={row.ticket.id}>
                  <td><span className="manager-complaint-dashboard__category" data-category={complaintCategory(row.ticket)}>{dashboard.categories.find((category) => category.id === complaintCategory(row.ticket))?.label}</span></td>
                  <td>{row.ticket.title}</td>
                  <td>{row.buildingName ?? "—"} / {row.ticket.unitId || "—"}</td>
                  <td>{formatComplaintDate(row.ticket.createdAt)}</td>
                  <td><span className="manager-complaint-dashboard__status" data-status={complaintStatusLabel(row.ticket.status)}>{complaintStatusLabel(row.ticket.status)}</span></td>
                </tr>
              ))}
              {dashboard.recent.length === 0 ? <tr><td colSpan={5} className="manager-complaint-dashboard__empty">선택한 기간에 접수된 일반 민원이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
