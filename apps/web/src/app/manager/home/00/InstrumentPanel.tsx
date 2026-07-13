import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

const GAUGE_TICK_COUNT = 11; // 0%~100%, 10% 간격
const GAUGE_TICK_MAJOR_INDEXES = new Set([0, 5, 10]); // 0 / 50 / 100 위치만 주눈금
const RING_TICK_DEGREES = [0, 90, 180, 270]; // 12/3/6/9시 방향 미세 눈금

/**
 * 운영 계기판 — 입주율 링 · 납부 반원 게이지 · 티켓 처리율 링을 인디고 카드 한 장에 통합.
 * 이전엔 [입주율 카드 | 히어로 카드 | 티켓 카드] 3장이었다 — 계기라는 하나의 이야기를 한 몸으로 묶는다.
 */
export function InstrumentPanel({
  depositRatePct,
  monthLabel,
  payerCounts,
  depositAmounts,
  occupancyPct,
  occupancySub,
  occupancyHref,
  ticketPct,
  ticketSub,
  ticketHref
}: {
  depositRatePct: number | null;
  monthLabel: string;
  payerCounts: { paid: number; total: number } | null;
  depositAmounts: { collected: number; billed: number } | null;
  occupancyPct: number | null;
  occupancySub: string;
  occupancyHref: string;
  ticketPct: number | null;
  ticketSub: string;
  ticketHref: string;
}) {
  const pct = typeof depositRatePct === "number" ? Math.max(0, Math.min(100, depositRatePct)) : null;
  // 게이지(pct)는 "낸 사람" 기준, 이 값은 "낸 금액" 기준 — 다른 산식이라 수치가 갈릴 수 있다.
  const amountPct = depositAmounts && depositAmounts.billed > 0
    ? Math.max(0, Math.min(100, Math.round((depositAmounts.collected / depositAmounts.billed) * 100)))
    : null;

  return (
    <section aria-label={`${monthLabel} 운영 계기판`} className="manager-instrument-panel">
      <div className="manager-instrument-top">
        <div className="manager-instrument-title">
          <span className="manager-instrument-icon-tile" aria-hidden="true">
            <CircleDollarSign size={40} strokeWidth={2} />
          </span>
          <div className="manager-instrument-title-copy">
            <span className="manager-instrument-eyebrow">납부 게이지</span>
            <h2>{monthLabel} 납부 현황</h2>
          </div>
        </div>
        <Link href={MANAGER_CROSS.billing} className="manager-instrument-chip">
          청구 관리
        </Link>
      </div>

      <div className="manager-instrument-gauges">
        <InstrumentRing label="입주율" pct={occupancyPct} sub={occupancySub} href={occupancyHref} />

        <div
          className="manager-instrument-gauge"
          role="meter"
          aria-label={`${monthLabel} 납부율`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-valuetext={pct == null ? "납부율을 확인할 수 없음" : `${pct}%`}
        >
          <div className="manager-instrument-gauge-face" aria-hidden="true">
            <span
              className="manager-instrument-gauge-arc"
              style={{
                background: `conic-gradient(from 270deg, #ffffff 0 ${(pct ?? 0) / 2}%, rgba(255, 255, 255, 0.22) ${(pct ?? 0) / 2}% 50%, transparent 50%)`
              }}
            />
            {Array.from({ length: GAUGE_TICK_COUNT }, (_, i) => (
              <span
                key={i}
                className={
                  GAUGE_TICK_MAJOR_INDEXES.has(i)
                    ? "manager-instrument-gauge-tick manager-instrument-gauge-tick--major"
                    : "manager-instrument-gauge-tick"
                }
                style={{ transform: `rotate(${-90 + i * 18}deg)` }}
              />
            ))}
            <span className="manager-instrument-gauge-endcap">0</span>
          </div>
          <div className="manager-instrument-gauge-copy" aria-hidden="true">
            <strong>{pct == null ? "—" : `${pct}%`}</strong>
            <span>{payerCounts ? `${payerCounts.paid} / ${payerCounts.total}명 납부` : "확인 필요"}</span>
          </div>
        </div>

        <InstrumentRing label="티켓 처리율" pct={ticketPct} sub={ticketSub} href={ticketHref} />
      </div>

      <div className="manager-instrument-bottom">
        <span className="manager-instrument-micro-label">수납액</span>
        <div className="manager-instrument-readout">
          <div className="manager-instrument-readout-row">
            <span className="manager-instrument-readout-value">
              {depositAmounts ? depositAmounts.collected.toLocaleString("ko-KR") : "—"}
              {depositAmounts ? <small>원</small> : null}
            </span>
            <span className="manager-instrument-readout-caption">
              {depositAmounts ? `청구 ${depositAmounts.billed.toLocaleString("ko-KR")}원 중` : "청구 내역 없음"}
            </span>
          </div>

          {depositAmounts && amountPct != null ? (
            <div
              className="manager-instrument-meter"
              role="meter"
              aria-label="금액 기준 수납률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={amountPct}
              aria-valuetext={`금액 기준 ${amountPct}%`}
            >
              <span className="manager-instrument-meter-track" aria-hidden="true">
                <span className="manager-instrument-meter-fill" style={{ width: `${amountPct}%` }} />
              </span>
              {/* 위 게이지는 "사람 기준" 납부율이라 이 값과 다를 수 있어 산식을 캡션에 못박는다 */}
              <span className="manager-instrument-meter-caption" aria-hidden="true">금액 기준 {amountPct}%</span>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        .manager-instrument-panel {
          position: relative;
          display: grid;
          gap: var(--space-lg);
          padding: var(--space-xl);
          border-radius: var(--radius-lg);
          background: linear-gradient(140deg, #6455e2 0%, #5747cf 55%, #4b3cba 100%);
          color: #ffffff;
          box-shadow: 0 18px 44px rgba(87, 71, 207, 0.35);
        }

        .manager-instrument-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-instrument-title {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .manager-instrument-icon-tile {
          width: 64px;
          height: 64px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: var(--radius);
          background: #ffffff;
          color: #5747cf;
        }

        .manager-instrument-title-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        /* 계기 이름표 — 자간 넓힌 마이크로 라벨 */
        .manager-instrument-eyebrow {
          color: rgba(255, 255, 255, 0.65);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-instrument-title-copy h2 {
          margin: 0;
          color: #ffffff;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
          font-weight: 800;
        }

        .manager-instrument-chip {
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

        .manager-instrument-chip:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        /* ── 3열: 입주율 링 | 반원 게이지 | 티켓 처리율 링 ── */
        .manager-instrument-gauges {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: var(--space-lg);
        }

        /* ── 링(입주율·티켓 처리율) — 흰색-온-인디고 변주, 카드 안 부분 링크 ── */
        .manager-instrument-ring-link {
          display: grid;
          grid-template-rows: auto 1fr auto;
          justify-items: center;
          gap: var(--space-sm);
          height: 100%;
          padding: var(--space-md);
          border-radius: var(--radius-md);
          color: inherit;
          text-decoration: none;
          text-align: center;
          transition: background-color 0.16s ease;
        }

        .manager-instrument-ring-link:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .manager-instrument-ring-label {
          color: #ffffff;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-instrument-ring-sub {
          color: rgba(255, 255, 255, 0.65);
          font-size: var(--fs-body);
        }

        .manager-instrument-ring {
          position: relative;
          width: 200px;
          height: 200px;
          align-self: center;
          display: grid;
          place-items: center;
        }

        .manager-instrument-ring-arc {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
        }

        /* 12/3/6/9시 미세 눈금 — 링 중심(100px)을 피벗으로 회전 배치 */
        .manager-instrument-ring-tick {
          position: absolute;
          top: 0;
          left: calc(50% - 1px);
          width: 2px;
          height: 6px;
          transform-origin: 50% 100px;
          background: rgba(255, 255, 255, 0.4);
        }

        .manager-instrument-ring-pct {
          font-size: 46px;
          line-height: 1.1;
          font-weight: 800;
          color: #ffffff;
        }

        /* 카드 폭이 좁아지는 구간 — 링이 넘치지 않도록 축소 */
        @media (max-width: 1120px) {
          .manager-instrument-ring {
            width: 160px;
            height: 160px;
          }

          .manager-instrument-ring-tick {
            transform-origin: 50% 80px;
          }
        }

        /* 더 좁은 화면 — 3열을 세로로 쌓고 게이지를 맨 위로 */
        @media (max-width: 720px) {
          .manager-instrument-gauges {
            grid-template-columns: 1fr;
          }

          .manager-instrument-gauge {
            order: -1;
          }
        }

        /* ── 반원 게이지(납부율) ── */
        .manager-instrument-gauge {
          display: grid;
          justify-items: center;
        }

        .manager-instrument-gauge-face {
          position: relative;
          width: 240px;
          height: 120px;
          overflow: hidden;
        }

        .manager-instrument-gauge-arc {
          position: absolute;
          inset: 0 0 -120px;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 17px), #000 calc(100% - 16px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 17px), #000 calc(100% - 16px));
          filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.35));
        }

        /* 미세 눈금 — 반지름 스팬을 회전시키고 바깥 끝 몇 px만 칠한다(정밀 계기 표현) */
        .manager-instrument-gauge-tick {
          position: absolute;
          bottom: 0;
          left: calc(50% - 0.75px);
          width: 1.5px;
          height: 100px;
          transform-origin: 50% 100%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.35) 5px, transparent 5px);
        }

        .manager-instrument-gauge-tick--major {
          left: calc(50% - 1px);
          width: 2px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 9px, transparent 9px);
        }

        .manager-instrument-gauge-endcap {
          position: absolute;
          bottom: 2px;
          left: 6px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
          font-weight: 700;
        }

        /* 반원 안쪽 빈 공간에 겹치도록 음수 마진으로 끌어올린다 */
        .manager-instrument-gauge-copy {
          display: grid;
          justify-items: center;
          gap: 2px;
          margin-top: -18px;
        }

        .manager-instrument-gauge-copy strong {
          font-size: 56px;
          line-height: 1.02;
          font-weight: 800;
        }

        .manager-instrument-gauge-copy span {
          color: rgba(255, 255, 255, 0.78);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        /* ── 하단 리드아웃 + 미터 바 — 카드 전체 폭 ── */
        .manager-instrument-bottom {
          display: grid;
          gap: var(--space-xs);
          padding-top: var(--space-md);
          border-top: 1px solid rgba(255, 255, 255, 0.22);
        }

        .manager-instrument-micro-label {
          color: rgba(255, 255, 255, 0.65);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        /* 디지털 리드아웃 — 계기 숫자창처럼 어두운 인셋 박스 안에 표시 */
        .manager-instrument-readout {
          display: grid;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.22);
        }

        .manager-instrument-readout-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-instrument-readout-value {
          font-variant-numeric: tabular-nums;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
          font-weight: 800;
          color: #ffffff;
        }

        .manager-instrument-readout-value small {
          margin-left: 2px;
          color: rgba(255, 255, 255, 0.7);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-instrument-readout-caption {
          flex: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: var(--fs-caption);
        }

        /* 금액 기준 수납률 미터 바 — 위 게이지(사람 기준)와 산식이 달라 캡션에서 명시한다 */
        .manager-instrument-meter {
          display: grid;
          gap: 4px;
        }

        .manager-instrument-meter-track {
          display: block;
          width: 100%;
          height: 8px;
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.18);
          overflow: hidden;
        }

        .manager-instrument-meter-fill {
          display: block;
          height: 100%;
          border-radius: var(--radius-full);
          background: #ffffff;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
        }

        .manager-instrument-meter-caption {
          justify-self: end;
          color: rgba(255, 255, 255, 0.6);
          font-size: 11px;
        }

        @media (max-width: 560px) {
          .manager-instrument-panel {
            padding: var(--space-lg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-instrument-chip,
          .manager-instrument-ring-link {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}

function InstrumentRing({ label, pct, sub, href }: { label: string; pct: number | null; sub: string; href: string }) {
  const clamped = pct == null ? null : Math.max(0, Math.min(100, pct));

  return (
    <Link href={href} className="manager-instrument-ring-link">
      <span className="manager-instrument-ring-label">{label}</span>

      <div
        className="manager-instrument-ring"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-valuetext={clamped == null ? `${label}을 확인할 수 없음` : `${clamped}%`}
      >
        <span
          className="manager-instrument-ring-arc"
          style={{ background: `conic-gradient(#ffffff ${clamped ?? 0}%, rgba(255, 255, 255, 0.22) 0)` }}
          aria-hidden="true"
        />
        {RING_TICK_DEGREES.map((deg) => (
          <span key={deg} className="manager-instrument-ring-tick" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true" />
        ))}
        <span className="manager-instrument-ring-pct" aria-hidden="true">
          {clamped == null ? "—" : `${clamped}%`}
        </span>
      </div>

      <span className="manager-instrument-ring-sub">{sub}</span>
    </Link>
  );
}
