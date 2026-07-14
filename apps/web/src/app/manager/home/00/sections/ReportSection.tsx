import Link from "next/link";
import { Badge } from "@roomlog/ui";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

// M-HOME-02(임대 현황 리포트) 데모 콘텐츠 — 통합 대시보드 우측 패널.
// 하단 스크롤 섹션이었을 때의 가로 스켈레톤 바를 세로 막대 그래프 4종으로 교체하고,
// 계기판 옆에서 한눈에 읽히도록 카드 한 장으로 압축했다. id="report"는 옛 앵커 링크 호환용.
const CHARTS = [
  { title: "월별 수익 추이", unit: "실수납", values: [1480, 1520, 1560, 1540, 1620, 1680] },
  { title: "공실률·입주율", unit: "입주율", values: [88, 90, 86, 92, 94, 96] },
  { title: "민원처리율", unit: "완료 티켓", values: [52, 61, 58, 66, 72, 78] },
  { title: "월별 수리비", unit: "비용", values: [120, 260, 90, 180, 340, 150] },
] as const;

export function ReportSection() {
  return (
    <section id="report" aria-labelledby="report-section-title" className="manager-report-panel">
      <div className="manager-report-head">
        <h2 id="report-section-title">임대 현황 리포트</h2>
        <span className="manager-report-demo">데모</span>
        <div className="manager-report-filters">
          <Badge emphasis>6M</Badge>
          <Badge>1Y</Badge>
          <Badge>PDF/CSV</Badge>
        </div>
      </div>

      <div className="manager-report-grid">
        {CHARTS.map(({ title, unit, values }) => {
          const max = Math.max(...values);
          const last = values.length - 1;
          return (
            <figure key={title} className="manager-report-chart">
              <figcaption>
                <strong>{title}</strong>
                <span>{unit}</span>
              </figcaption>
              <div
                className="manager-report-bars"
                role="img"
                aria-label={`${title} 최근 ${values.length}개월 추이, 최신 ${values[last].toLocaleString("ko-KR")}`}
              >
                {values.map((value, index) => (
                  <div key={index} className="manager-report-bar">
                    <span className="manager-report-bar-track">
                      <span
                        className={`manager-report-bar-fill${index === last ? " is-latest" : ""}`}
                        style={{ height: `${Math.max(8, Math.round((value / max) * 100))}%` }}
                      />
                    </span>
                    <small>{index + 1}월</small>
                  </div>
                ))}
              </div>
            </figure>
          );
        })}
      </div>

      <div className="manager-report-drills">
        <Link href={`${MANAGER_CROSS.billing}/overdue`}>미납 드릴다운</Link>
        <Link href={MANAGER_CROSS.ticketDash}>수리비 드릴다운</Link>
      </div>

      <style>{`
        .manager-report-panel {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: var(--space-md);
          padding: var(--space-lg);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
          scroll-margin-top: 96px;
        }

        .manager-report-head {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }

        .manager-report-head h2 {
          margin: 0;
          font-size: var(--fs-subtitle);
          line-height: var(--lh-subtitle);
        }

        .manager-report-demo {
          flex: 0 0 auto;
          padding: 2px var(--space-sm);
          border-radius: var(--radius-full);
          color: var(--on-warning-container);
          background: var(--warning-container);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-report-filters {
          margin-left: auto;
          display: flex;
          gap: var(--space-xs);
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .manager-report-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-md);
        }

        .manager-report-chart {
          margin: 0;
          display: grid;
          gap: var(--space-sm);
          padding: var(--space-md);
          border-radius: var(--radius);
          background: var(--surface-container-low);
        }

        .manager-report-chart figcaption {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-sm);
        }

        .manager-report-chart figcaption strong {
          font-size: 14px;
          font-weight: 800;
        }

        .manager-report-chart figcaption span {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
          white-space: nowrap;
        }

        .manager-report-bars {
          display: flex;
          align-items: flex-end;
          gap: var(--space-xs);
        }

        .manager-report-bar {
          flex: 1;
          min-width: 0;
          display: grid;
          justify-items: center;
          gap: 4px;
        }

        .manager-report-bar-track {
          width: 100%;
          height: 88px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .manager-report-bar-fill {
          width: clamp(10px, 55%, 18px);
          border-radius: 5px 5px 2px 2px;
          background: color-mix(in srgb, var(--primary) 30%, #ffffff);
        }

        .manager-report-bar-fill.is-latest {
          background: var(--primary);
        }

        .manager-report-bar small {
          color: var(--on-surface-variant);
          font-size: 11px;
          font-weight: 700;
        }

        .manager-report-drills {
          display: flex;
          gap: var(--space-md);
          flex-wrap: wrap;
        }

        .manager-report-drills a {
          color: var(--primary);
          font-weight: 800;
          font-size: var(--fs-caption);
          text-decoration: none;
        }

        @media (max-width: 480px) {
          .manager-report-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
