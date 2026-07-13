import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

const TICK_COUNT = 11; // 0%~100%, 10% 간격
const TICK_MAJOR_INDEXES = new Set([0, 5, 10]); // 0 / 50 / 100 위치만 주눈금

/** 이번 달 납부 현황 히어로 — 벤토 그리드의 주 계기(PFD). 큰 반원 아크에 미세 눈금과 디지털 리드아웃을 얹는다. */
export function HeroDepositCard({
  depositRatePct,
  monthLabel,
  payerCounts,
  depositAmounts
}: {
  depositRatePct: number | null;
  monthLabel: string;
  payerCounts: { paid: number; total: number } | null;
  depositAmounts: { collected: number; billed: number } | null;
}) {
  const pct = typeof depositRatePct === "number" ? Math.max(0, Math.min(100, depositRatePct)) : null;
  // 게이지(pct)는 "낸 사람" 기준, 이 값은 "낸 금액" 기준 — 다른 산식이라 수치가 갈릴 수 있다.
  const amountPct = depositAmounts && depositAmounts.billed > 0
    ? Math.max(0, Math.min(100, Math.round((depositAmounts.collected / depositAmounts.billed) * 100)))
    : null;

  return (
    <section aria-label={`${monthLabel} 납부 현황`} className="manager-hero-deposit">
      <div className="manager-hero-top">
        <div className="manager-hero-title">
          <span className="manager-hero-icon-tile" aria-hidden="true">
            <CircleDollarSign size={40} strokeWidth={2} />
          </span>
          <div className="manager-hero-title-copy">
            <span className="manager-hero-eyebrow">납부 게이지</span>
            <h2>{monthLabel} 납부 현황</h2>
          </div>
        </div>
        <Link href={MANAGER_CROSS.billing} className="manager-hero-chip">
          청구 관리
        </Link>
      </div>

      <div
        className="manager-hero-gauge"
        role="meter"
        aria-label={`${monthLabel} 납부율`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct == null ? "납부율을 확인할 수 없음" : `${pct}%`}
      >
        <div className="manager-hero-gauge-face" aria-hidden="true">
          <span
            className="manager-hero-gauge-arc"
            style={{
              background: `conic-gradient(from 270deg, #ffffff 0 ${(pct ?? 0) / 2}%, rgba(255, 255, 255, 0.22) ${(pct ?? 0) / 2}% 50%, transparent 50%)`
            }}
          />
          {Array.from({ length: TICK_COUNT }, (_, i) => (
            <span
              key={i}
              className={
                TICK_MAJOR_INDEXES.has(i) ? "manager-hero-gauge-tick manager-hero-gauge-tick--major" : "manager-hero-gauge-tick"
              }
              style={{ transform: `rotate(${-90 + i * 18}deg)` }}
            />
          ))}
          <span className="manager-hero-gauge-endcap manager-hero-gauge-endcap--start">0</span>
        </div>
        <div className="manager-hero-gauge-copy" aria-hidden="true">
          <strong>{pct == null ? "—" : `${pct}%`}</strong>
          <span>{payerCounts ? `${payerCounts.paid} / ${payerCounts.total}명 납부` : "확인 필요"}</span>
        </div>
      </div>

      <div className="manager-hero-bottom">
        <span className="manager-hero-micro-label">수납액</span>
        <div className="manager-hero-readout">
          <div className="manager-hero-readout-row">
            <span className="manager-hero-readout-value">
              {depositAmounts ? depositAmounts.collected.toLocaleString("ko-KR") : "—"}
              {depositAmounts ? <small>원</small> : null}
            </span>
            <span className="manager-hero-readout-caption">
              {depositAmounts ? `청구 ${depositAmounts.billed.toLocaleString("ko-KR")}원 중` : "청구 내역 없음"}
            </span>
          </div>

          {depositAmounts && amountPct != null ? (
            <div
              className="manager-hero-meter"
              role="meter"
              aria-label="금액 기준 수납률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={amountPct}
              aria-valuetext={`금액 기준 ${amountPct}%`}
            >
              <span className="manager-hero-meter-track" aria-hidden="true">
                <span className="manager-hero-meter-fill" style={{ width: `${amountPct}%` }} />
              </span>
              {/* 위 게이지는 "사람 기준" 납부율이라 이 값과 다를 수 있어 산식을 캡션에 못박는다 */}
              <span className="manager-hero-meter-caption" aria-hidden="true">금액 기준 {amountPct}%</span>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        .manager-hero-deposit {
          position: relative;
          display: grid;
          align-content: start;
          gap: var(--space-lg);
          height: 100%;
          padding: var(--space-xl);
          border-radius: var(--radius-lg);
          background: linear-gradient(140deg, #6455e2 0%, #5747cf 55%, #4b3cba 100%);
          color: #ffffff;
          box-shadow: 0 18px 44px rgba(87, 71, 207, 0.35);
        }

        .manager-hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-hero-title {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .manager-hero-icon-tile {
          width: 64px;
          height: 64px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: var(--radius);
          background: #ffffff;
          color: #5747cf;
        }

        .manager-hero-title-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        /* 계기 이름표 — 자간 넓힌 마이크로 라벨 */
        .manager-hero-eyebrow {
          color: rgba(255, 255, 255, 0.65);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-hero-title-copy h2 {
          margin: 0;
          /* 전역 헤딩 잉크색이 인디고 카드 위에서 묻히므로 흰색 명시 */
          color: #ffffff;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
          font-weight: 800;
        }

        .manager-hero-chip {
          flex: none;
          display: inline-flex;
          align-items: center;
          height: 36px;
          padding: 0 var(--space-md);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          text-decoration: none;
          font-size: var(--fs-caption);
          font-weight: 700;
          white-space: nowrap;
          transition: background-color 0.16s ease;
        }

        .manager-hero-chip:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .manager-hero-gauge {
          display: grid;
          justify-items: center;
        }

        .manager-hero-gauge-face {
          position: relative;
          width: 240px;
          height: 120px;
          overflow: hidden;
        }

        .manager-hero-gauge-arc {
          position: absolute;
          inset: 0 0 -120px;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 17px), #000 calc(100% - 16px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 17px), #000 calc(100% - 16px));
          filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.35));
        }

        /* 미세 눈금 — 반지름 스팬을 회전시키고 바깥 끝 몇 px만 칠한다(정밀 계기 표현) */
        .manager-hero-gauge-tick {
          position: absolute;
          bottom: 0;
          left: calc(50% - 0.75px);
          width: 1.5px;
          height: 100px;
          transform-origin: 50% 100%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.35) 5px, transparent 5px);
        }

        .manager-hero-gauge-tick--major {
          left: calc(50% - 1px);
          width: 2px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 9px, transparent 9px);
        }

        .manager-hero-gauge-endcap {
          position: absolute;
          bottom: 2px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
          font-weight: 700;
        }

        .manager-hero-gauge-endcap--start {
          left: 6px;
        }

        /* 반원 안쪽 빈 공간에 겹치도록 음수 마진으로 끌어올린다 */
        .manager-hero-gauge-copy {
          display: grid;
          justify-items: center;
          gap: 2px;
          margin-top: -18px;
        }

        .manager-hero-gauge-copy strong {
          font-size: 56px;
          line-height: 1.02;
          font-weight: 800;
        }

        .manager-hero-gauge-copy span {
          color: rgba(255, 255, 255, 0.78);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-hero-bottom {
          display: grid;
          gap: var(--space-xs);
          padding-top: var(--space-md);
          border-top: 1px solid rgba(255, 255, 255, 0.22);
        }

        .manager-hero-micro-label {
          color: rgba(255, 255, 255, 0.65);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        /* 디지털 리드아웃 — 계기 숫자창처럼 어두운 인셋 박스 안에 표시 */
        .manager-hero-readout {
          display: grid;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.22);
        }

        .manager-hero-readout-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-hero-readout-value {
          font-variant-numeric: tabular-nums;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
          font-weight: 800;
          color: #ffffff;
        }

        .manager-hero-readout-value small {
          margin-left: 2px;
          color: rgba(255, 255, 255, 0.7);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-hero-readout-caption {
          flex: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: var(--fs-caption);
        }

        /* 금액 기준 수납률 미터 바 — 위 게이지(사람 기준)와 산식이 달라 캡션에서 명시한다 */
        .manager-hero-meter {
          display: grid;
          gap: 4px;
        }

        .manager-hero-meter-track {
          display: block;
          width: 100%;
          height: 8px;
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.18);
          overflow: hidden;
        }

        .manager-hero-meter-fill {
          display: block;
          height: 100%;
          border-radius: var(--radius-full);
          background: #ffffff;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
        }

        .manager-hero-meter-caption {
          justify-self: end;
          color: rgba(255, 255, 255, 0.6);
          font-size: 11px;
        }

        @media (max-width: 560px) {
          .manager-hero-deposit {
            padding: var(--space-lg);
          }
        }
      `}</style>
    </section>
  );
}
