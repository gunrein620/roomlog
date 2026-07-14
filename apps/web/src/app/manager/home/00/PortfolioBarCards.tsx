// 계기 패널 아래 자산 추이 — 반투명 accent 막대 위에 별을 얹고 얇은 별자리 선으로 잇는 콤보 카드 2장.
// 위 다크 은하 계기판과 한 덩어리가 되는 코스믹 카드. 나란히 두면 두 카드 묶음 폭이 계기판과 같다.

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

const REPAIR_DATA: MonthValue[] = [
  { m: "1월", v: 120 },
  { m: "2월", v: 260 },
  { m: "3월", v: 90 },
  { m: "4월", v: 180 },
  { m: "5월", v: 340 },
  { m: "6월", v: 110 },
  { m: "7월", v: 150 },
  { m: "8월", v: 300 },
  { m: "9월", v: 80 },
  { m: "10월", v: 220 },
  { m: "11월", v: 130 },
  { m: "12월", v: 260 },
];

/** 별자리 콤보 카드 2장 — 월별 수익 추이·월별 수리비 12개월을 반투명 막대 + 발광 별 + 추이선으로. */
export function PortfolioBarCards() {
  return (
    <div className="manager-portfolio-bars">
      <ConstellationCard chartId="revenue" title="월별 수익 추이" data={REVENUE_DATA} accent="#a9c4ff" />
      <ConstellationCard chartId="repair" title="월별 수리비" data={REPAIR_DATA} accent="#d9b8f5" />

      <style>{`
        /* 나란히 2열 — 두 카드 묶음의 좌우 끝이 위 계기판 폭과 일치(각 카드는 절반) */
        .manager-portfolio-bars {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-sm);
        }

        .manager-constellation-card {
          /* <figure> 기본 좌우 40px 마진 제거 — 이걸 안 하면 카드가 안쪽으로 파여 계기판보다 좁아 보인다 */
          margin: 0;
          display: grid;
          align-content: start;
          gap: var(--space-md);
          padding: var(--space-xl);
          border-radius: var(--radius-md);
          /* 계기판(다크 은하 패널)과 같은 톤 — 별이 뜨는 밤하늘 */
          background: linear-gradient(165deg, #12112f 0%, #1b1642 52%, #2a2056 100%);
          box-shadow: 0 18px 44px rgba(30, 24, 64, 0.34);
        }

        .manager-constellation-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-sm);
        }

        .manager-constellation-title {
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-constellation-headline {
          font-variant-numeric: tabular-nums;
          font-size: 28px;
          line-height: 1.15;
          font-weight: 800;
          color: #ffffff;
          white-space: nowrap;
        }

        .manager-constellation-headline span {
          margin-left: var(--space-xs);
          font-size: var(--fs-caption);
          font-weight: 700;
          color: rgba(255, 255, 255, 0.6);
        }

        .manager-constellation-chart {
          width: 100%;
          height: auto;
          display: block;
        }

        @media (max-width: 480px) {
          .manager-portfolio-bars {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// 데이터 최대값을 1·2·5·10 계열의 "깔끔한" 축 상한으로 올림 — 눈금이 4등분으로 딱 떨어지게.
function niceAxisMax(dataMax: number): number {
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
}: {
  chartId: string;
  title: string;
  data: MonthValue[];
  accent: string;
}) {
  const axisMax = niceAxisMax(Math.max(...data.map((d) => d.v)));
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
          {latest.v.toLocaleString("ko-KR")}
          <span>만원</span>
        </strong>
      </figcaption>

      <svg
        className="manager-constellation-chart"
        viewBox="0 0 360 210"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${title} 12개월 추이, 최신 ${latest.v.toLocaleString("ko-KR")}만원`}
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
            {i + 1}
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
                <title>{`${d.m} · ${d.v.toLocaleString("ko-KR")}만원`}</title>
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
