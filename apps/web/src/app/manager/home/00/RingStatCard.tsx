import Link from "next/link";

const TICK_DEGREES = [0, 90, 180, 270]; // 12/3/6/9시 방향 미세 눈금

/**
 * 재사용 링 스탯 카드 — 입주율·티켓 처리율 공용.
 * 세로 구성(라벨 상단 · 링 중앙 · sub 하단)으로 1/3 셀을 채우는 보조 계기.
 */
export function RingStatCard({
  label,
  pct,
  sub,
  href,
  gridArea,
  tint
}: {
  label: string;
  pct: number | null;
  sub: string;
  href: string;
  gridArea?: string;
  tint?: "blue" | "mint";
}) {
  const clamped = pct == null ? null : Math.max(0, Math.min(100, pct));

  return (
    <Link
      href={href}
      className={tint ? `manager-ring-stat-card manager-ring-stat-card--${tint}` : "manager-ring-stat-card"}
      style={gridArea ? { gridArea } : undefined}
    >
      <span className="manager-ring-stat-label">{label}</span>

      <div
        className="manager-ring-stat-ring"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-valuetext={clamped == null ? `${label}을 확인할 수 없음` : `${clamped}%`}
      >
        <span
          className="manager-ring-stat-arc"
          style={{ background: `conic-gradient(var(--primary) ${clamped ?? 0}%, var(--primary-container) 0)` }}
          aria-hidden="true"
        />
        {TICK_DEGREES.map((deg) => (
          <span key={deg} className="manager-ring-stat-tick" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true" />
        ))}
        <span className="manager-ring-stat-pct" aria-hidden="true">
          {clamped == null ? "—" : `${clamped}%`}
        </span>
      </div>

      <span className="manager-ring-stat-sub">{sub}</span>

      <style>{`
        .manager-ring-stat-card {
          min-width: 0;
          display: grid;
          grid-template-rows: auto 1fr auto;
          justify-items: center;
          gap: var(--space-sm);
          height: 100%;
          /* 라벨이 상단에 붙어 보이지 않게 위쪽만 여유를 더 준다 */
          padding: var(--space-xl) var(--space-md) var(--space-md);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
          color: inherit;
          text-decoration: none;
          text-align: center;
          transition: transform 0.16s ease;
        }

        /* 카드 배경 옅은 틴트 — 흰 카드보다 반 톤 어린 색 수준으로만 */
        .manager-ring-stat-card--blue {
          background: color-mix(in srgb, var(--pastel-blue) 40%, var(--surface-container-lowest));
        }

        .manager-ring-stat-card--mint {
          background: color-mix(in srgb, var(--pastel-mint) 40%, var(--surface-container-lowest));
        }

        .manager-ring-stat-card:hover {
          transform: translateY(-2px);
        }

        /* 계기 이름표 — 자간 넓힌 마이크로 라벨, 라벨·링·캡션 전부 세로축 중앙 정렬로 대칭을 맞춘다 */
        .manager-ring-stat-label {
          justify-self: center;
          color: var(--on-surface-variant);
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-ring-stat-sub {
          color: var(--on-surface-variant);
          font-size: var(--fs-body);
        }

        .manager-ring-stat-ring {
          position: relative;
          width: 192px;
          height: 192px;
          align-self: center;
          display: grid;
          place-items: center;
        }

        .manager-ring-stat-arc {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
          filter: drop-shadow(0 0 6px rgba(87, 71, 207, 0.25));
        }

        /* 12/3/6/9시 미세 눈금 — 링 중심(96px)을 피벗으로 회전 배치 */
        .manager-ring-stat-tick {
          position: absolute;
          top: 0;
          left: calc(50% - 1px);
          width: 2px;
          height: 6px;
          transform-origin: 50% 96px;
          background: var(--outline);
          opacity: 0.4;
        }

        .manager-ring-stat-pct {
          font-size: 40px;
          line-height: 1.1;
          font-weight: 800;
          color: var(--on-surface);
        }

        /* 2열로 좁아지는 구간 — 카드 폭이 줄어도 링이 넘치지 않도록 축소 */
        @media (max-width: 1120px) {
          .manager-ring-stat-ring {
            width: 152px;
            height: 152px;
          }

          .manager-ring-stat-tick {
            transform-origin: 50% 76px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-ring-stat-card {
            transition: none;
          }

          .manager-ring-stat-card:hover {
            transform: none;
          }
        }
      `}</style>
    </Link>
  );
}
