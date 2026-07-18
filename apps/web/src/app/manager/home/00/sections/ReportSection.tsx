import Link from "next/link";
import { Badge } from "@roomlog/ui";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";
import type { DashboardRepairExpenseSummary } from "../dashboard-calculations";

// M-HOME-02(임대 현황 리포트) 데모 콘텐츠 — 통합 대시보드의 차트 밴드.
// 흰 미니 막대 카드(수익·수리비가 별자리 카드와 중복)를 걷어내고, 네 지표 전부를
// 계기판과 같은 다크 별자리 카드 한 줄로 통일했다. id="report"는 옛 앵커 링크 호환용.

type MonthValue = { m: string; v: number };

const REVENUE_DATA: MonthValue[] = [
  { m: "1월", v: 1480 },
  { m: "2월", v: 1520 },
  { m: "3월", v: 1560 },
  { m: "4월", v: 1540 },
  { m: "5월", v: 1620 },
  { m: "6월", v: 1600 },
  { m: "7월", v: 1680 },
  { m: "8월", v: 1710 },
  { m: "9월", v: 1690 },
  { m: "10월", v: 1780 },
  { m: "11월", v: 1830 },
  { m: "12월", v: 1860 },
];

const OCCUPANCY_DATA: MonthValue[] = [
  { m: "1월", v: 84 },
  { m: "2월", v: 85 },
  { m: "3월", v: 87 },
  { m: "4월", v: 86 },
  { m: "5월", v: 88 },
  { m: "6월", v: 89 },
  { m: "7월", v: 90 },
  { m: "8월", v: 91 },
  { m: "9월", v: 92 },
  { m: "10월", v: 93 },
  { m: "11월", v: 95 },
  { m: "12월", v: 96 },
];

const TICKET_DATA: MonthValue[] = [
  { m: "1월", v: 48 },
  { m: "2월", v: 55 },
  { m: "3월", v: 52 },
  { m: "4월", v: 61 },
  { m: "5월", v: 58 },
  { m: "6월", v: 66 },
  { m: "7월", v: 63 },
  { m: "8월", v: 72 },
  { m: "9월", v: 69 },
  { m: "10월", v: 75 },
  { m: "11월", v: 78 },
  { m: "12월", v: 82 },
];

// 별자리 스펙트럼 — 계기판 아크와 같은 계열(페리윙클·바이올렛·라벤더화이트·핑크)에서 카드마다 차등.
const EMPTY_REPAIR_DATA: MonthValue[] = Array.from({ length: 12 }, (_, index) => ({
  m: `${index + 1}월`,
  v: 0
}));

export function ReportSection({
  repairExpenses
}: {
  repairExpenses: DashboardRepairExpenseSummary | null;
}) {
  const charts = [
    { chartId: "revenue", title: "월별 수익 추이", data: REVENUE_DATA, accent: "#a9c4ff", unit: "만원" },
    {
      chartId: "repair",
      title: "월별 수리비",
      data: repairExpenses?.monthlyTrend ?? EMPTY_REPAIR_DATA,
      accent: "#d9b8f5",
      unit: "만원",
      unavailable: !repairExpenses
    },
    { chartId: "occupancy", title: "공실률·입주율", data: OCCUPANCY_DATA, accent: "#f2edff", unit: "%", axisMax: 100 },
    { chartId: "tickets", title: "민원처리율", data: TICKET_DATA, accent: "#f6a9cd", unit: "%", axisMax: 100 },
  ] as const;

  return (
    <section id="report" aria-labelledby="report-section-title" className="manager-report-section">
      <div className="manager-report-head">
        <h2 id="report-section-title">임대 현황 리포트</h2>
        <span className="manager-report-demo">일부 데모</span>
        <div className="manager-report-filters">
          <Badge>6M</Badge>
          <Badge emphasis>1Y</Badge>
          <Badge>PDF/CSV</Badge>
        </div>
      </div>

      <div className="manager-report-charts">
        {charts.map((chart) => (
          <ConstellationCard key={chart.chartId} {...chart} />
        ))}
      </div>

      <div className="manager-report-drills">
        <Link href={`${MANAGER_CROSS.billing}/overdue`}>미납 드릴다운</Link>
        <Link href={MANAGER_CROSS.ticketDash}>수리비 드릴다운</Link>
      </div>

      <style>{`
        .manager-report-section {
          display: grid;
          gap: var(--space-md);
          scroll-margin-top: 96px;
        }

        .manager-report-head {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }

        /* 관리 중인 집·오늘 확인할 업무와 같은 급의 섹션 헤딩 */
        .manager-report-head h2 {
          margin: 0;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
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

        /* 별자리 카드 4장 한 줄 — 계기판(다크 은하)과 한 덩어리로 읽히는 차트 밴드 */
        .manager-report-charts {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-md);
        }

        .manager-constellation-card {
          /* <figure> 기본 좌우 40px 마진 제거 — 이걸 안 하면 카드가 안쪽으로 파인다 */
          margin: 0;
          display: grid;
          align-content: start;
          gap: var(--space-sm);
          padding: var(--space-lg);
          border-radius: var(--radius-md);
          /* 계기판(다크 은하 패널)과 같은 톤 — 별이 뜨는 밤하늘 */
          background: linear-gradient(165deg, #12112f 0%, #1b1642 52%, #2a2056 100%);
          box-shadow: 0 14px 36px rgba(30, 24, 64, 0.3);
          /* 카드가 왼쪽부터 순서대로 떠오른다 — 로드 한 번의 오케스트레이션 */
          animation: manager-constellation-rise 0.5s cubic-bezier(0.22, 0.9, 0.28, 1) backwards;
        }

        .manager-constellation-card:nth-child(2) { animation-delay: 0.07s; }
        .manager-constellation-card:nth-child(3) { animation-delay: 0.14s; }
        .manager-constellation-card:nth-child(4) { animation-delay: 0.21s; }

        @keyframes manager-constellation-rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
        }

        .manager-constellation-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-sm);
        }

        .manager-constellation-title {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }

        .manager-constellation-headline {
          font-variant-numeric: tabular-nums;
          font-size: 22px;
          line-height: 1.15;
          font-weight: 800;
          color: #ffffff;
          white-space: nowrap;
        }

        .manager-constellation-headline span {
          margin-left: 2px;
          font-size: var(--fs-caption);
          font-weight: 700;
          color: rgba(255, 255, 255, 0.6);
        }

        .manager-constellation-chart {
          width: 100%;
          height: auto;
          display: block;
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

        @media (max-width: 1160px) {
          .manager-report-charts {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 600px) {
          .manager-report-charts {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-constellation-card {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

// 데이터 최대값을 1·2·5·10 계열의 "깔끔한" 축 상한으로 올림 — 눈금이 4등분으로 딱 떨어지게.
function niceAxisMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 4;
  const rough = dataMax / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow * 4;
}

// ── SVG 좌표계: viewBox 360×210, 여백 좌40·우10·상14·하30 → plot 310×166 ──
const PLOT = { left: 40, right: 350, top: 14, bottom: 180, w: 310, h: 166 } as const;
const BAR_W = 14;

function ConstellationCard({
  chartId,
  title,
  data,
  accent,
  unit = "만원",
  axisMax: fixedAxisMax,
  unavailable = false,
}: {
  chartId: string;
  title: string;
  data: readonly MonthValue[];
  accent: string;
  unit?: string;
  /** %처럼 자연 상한이 있는 지표는 축을 고정한다(자동 올림이 200%를 만들지 않게). */
  axisMax?: number;
  unavailable?: boolean;
}) {
  const axisMax = fixedAxisMax ?? niceAxisMax(Math.max(...data.map((d) => d.v)));
  const latest = data[data.length - 1];
  const last = data.length - 1;

  // 막대는 균등 밴드 중앙(i+0.5)에 — 양끝 안 잘리게. 선·별도 같은 x 공유.
  const band = PLOT.w / data.length;
  const x = (i: number) => PLOT.left + (i + 0.5) * band;
  const y = (v: number) => PLOT.top + (1 - v / axisMax) * PLOT.h;
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(" ");

  const ticks = [0, 1, 2, 3, 4].map((q) => ({
    value: (axisMax / 4) * q,
    yy: PLOT.top + (1 - q / 4) * PLOT.h,
  }));

  const glowId = `constellation-glow-${chartId}`;
  const lx = x(last);
  const ly = y(latest.v);

  return (
    <figure className="manager-constellation-card">
      <figcaption className="manager-constellation-header">
        <span className="manager-constellation-title">{title}</span>
        <strong className="manager-constellation-headline">
          {unavailable ? "확인 필요" : latest.v.toLocaleString("ko-KR")}
          {!unavailable ? <span>{unit}</span> : null}
        </strong>
      </figcaption>

      <svg
        className="manager-constellation-chart"
        viewBox="0 0 360 210"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          unavailable
            ? `${title} 데이터를 확인할 수 없음`
            : `${title} 12개월 추이, 최신 ${latest.v.toLocaleString("ko-KR")}${unit}`
        }
      >
        <defs>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" />
          </filter>
        </defs>

        {/* 그리드라인 + y축 값 라벨 */}
        {ticks.map(({ value, yy }) => (
          <g key={value}>
            <line x1={PLOT.left} x2={PLOT.right} y1={yy} y2={yy} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
            <text
              x={PLOT.left - 7}
              y={yy + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill="rgba(255,255,255,0.6)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {value.toLocaleString("ko-KR")}
            </text>
          </g>
        ))}

        {/* 반투명 accent 막대 — 상단 라운드, 위아래 균일(페이드 없음) */}
        {data.map((d, i) => (
          <rect
            key={d.m}
            x={x(i) - BAR_W / 2}
            y={y(d.v)}
            width={BAR_W}
            height={Math.max(0, PLOT.bottom - y(d.v))}
            rx="3"
            fill={accent}
            opacity="0.2"
          />
        ))}

        {/* 월 라벨 */}
        {data.map((d, i) => (
          <text key={d.m} x={x(i)} y={198} textAnchor="middle" fontSize="10.5" fill="rgba(255,255,255,0.55)">
            {d.m.replace("월", "")}
          </text>
        ))}

        {/* 별자리 선 — 카드 정체색(accent) 얇게, 막대 꼭대기를 잇는다 */}
        <polyline
          points={points}
          fill="none"
          stroke={accent}
          strokeWidth="1.4"
          strokeOpacity="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 별(막대 꼭대기) — accent 네뷸라 헤일로 + 흰 코어 */}
        {data.map((d, i) => {
          const isLatest = i === last;
          return (
            <g key={d.m}>
              <circle cx={x(i)} cy={y(d.v)} r={isLatest ? 4.5 : 3.2} fill={accent} opacity="0.5" filter={`url(#${glowId})`} />
              <circle cx={x(i)} cy={y(d.v)} r={isLatest ? 2.6 : 1.9} fill="#ffffff">
                <title>{`${d.m} · ${d.v.toLocaleString("ko-KR")}${unit}`}</title>
              </circle>
            </g>
          );
        })}

        {/* 최신 달 강조 — 회절 십자광 */}
        <g stroke="rgba(255,255,255,0.72)" strokeWidth="0.9" strokeLinecap="round">
          <line x1={lx - 8} x2={lx + 8} y1={ly} y2={ly} />
          <line x1={lx} x2={lx} y1={ly - 8} y2={ly + 8} />
        </g>
      </svg>
    </figure>
  );
}
