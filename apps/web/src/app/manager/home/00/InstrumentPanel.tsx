import Link from "next/link";
import type { CSSProperties } from "react";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

// 세 계기 아크의 코스믹 팔레트 — 배경 은하수(연블루 별·보라 성운)와 같은 계열에서 미묘하게 차등.
// 히어로인 납부 게이지가 가장 밝은 라벤더-화이트, 입주율은 페리윙클, 티켓은 연바이올렛.
// % 숫자·트랙은 흰색 계열 유지 (가독성). 셋 다 은하 배경 대비 9:1 이상.
const ARC_OCCUPANCY = "#a9c4ff";
const ARC_GAUGE = "#f2edff";
const ARC_TICKET = "#d9b8f5";

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
        <Link href={MANAGER_CROSS.billing} className="manager-instrument-chip">
          청구 관리
        </Link>
      </div>

      <div className="manager-instrument-gauges">
        <InstrumentRing label="입주율" pct={occupancyPct} sub={occupancySub} href={occupancyHref} accent={ARC_OCCUPANCY} />

        <div className="manager-instrument-gauge-column">
          {/* 좌우 링 라벨과 같은 급으로 통일 — 접근성 이름은 아래 role=meter의 aria-label이 맡는다 */}
          <span className="manager-instrument-gauge-label" aria-hidden="true">{monthLabel} 납부 현황</span>

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
                  background: `conic-gradient(from 270deg, ${ARC_GAUGE} 0 ${(pct ?? 0) / 2}%, rgba(255, 255, 255, 0.22) ${(pct ?? 0) / 2}% 50%, transparent 50%)`
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
              {pct != null ? (
                <>
                  <span
                    className="manager-instrument-gauge-needle"
                    style={{ transform: `rotate(${(pct / 100) * 180 - 90}deg)` }}
                    aria-hidden="true"
                  />
                  <span className="manager-instrument-gauge-hub" aria-hidden="true" />
                </>
              ) : null}
            </div>
            <div className="manager-instrument-gauge-copy" aria-hidden="true">
              <strong>{pct == null ? "—" : `${pct}%`}</strong>
              <span>{payerCounts ? `${payerCounts.paid} / ${payerCounts.total}명 납부` : "확인 필요"}</span>
            </div>
          </div>
        </div>

        <InstrumentRing label="티켓 처리율" pct={ticketPct} sub={ticketSub} href={ticketHref} accent={ARC_TICKET} />
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
        /* 심야 은하수 — SVG 텍스처 한 장(별 ~311개 4층위 + 은하수 띠 + 성운 + 코어 벌지, 절반 감쇠판).
           은하 중심부는 우상단 모서리에 앉고 띠가 좌하단 보라 성운으로 대각선으로 흐른다.
           중앙(게이지·링·숫자 자리)은 텍스처에 구운 역-비네트로 항상 어둡다 —
           실측 대비: 칩 자리 ~11:1, 게이지 뒤 17:1+. 밝은 별·헤일로는 중앙 존 생성 배제.
           아래 linear-gradient는 텍스처 로딩 전 fallback (SVG 하늘 그라데이션과 동일 톤). */
        .manager-instrument-panel {
          position: relative;
          /* 글랜스 2단 배치로 카드가 절반 폭에도 들어간다 — 게이지 축소·재배치는
             뷰포트가 아니라 카드 자신의 폭 기준(컨테이너 쿼리)으로 판단한다. */
          container-type: inline-size;
          display: grid;
          gap: var(--space-lg);
          padding: var(--space-xl);
          border-radius: var(--radius-lg);
          background:
            url("/textures/cosmic-panel.svg") center / cover no-repeat,
            linear-gradient(168deg, #0a0c24 0%, #171040 45%, #281b52 75%, #3a2a6a 100%);
          color: #ffffff;
          box-shadow: 0 24px 56px rgba(30, 24, 64, 0.4);
        }

        .manager-instrument-top {
          display: flex;
          justify-content: flex-end;
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

        /* ── 3열: 입주율 링 | 반원 게이지 | 티켓 처리율 링 — 라벨이 셋 다 같은 줄에서 시작하도록 상단 정렬 ── */
        .manager-instrument-gauges {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: start;
          gap: var(--space-lg);
        }

        /* 가운데 게이지 컬럼 — 라벨은 좌우 링 라벨과 같은 줄(상단), 게이지는 바닥 정렬.
           반원 게이지가 링보다 짧아 상단만 맞추면 아래가 떠서, 게이지를 컬럼 하단에 붙인다. */
        .manager-instrument-gauge-column {
          display: grid;
          grid-template-rows: auto 1fr;
          justify-items: center;
          height: 100%;
        }

        .manager-instrument-gauge-label {
          color: #ffffff;
          font-size: 27px;
          font-weight: 800;
          letter-spacing: 0.1em;
          margin-bottom: var(--space-lg);
        }

        /* ── 링(입주율·티켓 처리율) — 아크 색·글로우는 accent를 따라 인라인, 카드 안 부분 링크 ── */
        .manager-instrument-ring-link {
          display: grid;
          grid-template-rows: auto 1fr auto;
          justify-items: center;
          gap: var(--space-sm);
          height: 100%;
          /* 상단 패딩 제거 — 링 라벨을 가운데 게이지 라벨(이번 달 납부 현황) 줄에 맞춘다 */
          padding: 0 var(--space-md) var(--space-md);
          border-radius: var(--radius-md);
          color: inherit;
          text-decoration: none;
          text-align: center;
          transition: background-color 0.16s ease;
        }

        /* 다크 은하 배경엔 각진 흰 박스가 튄다 — 링 모양을 따라가는 부드러운 원형 글로우로 */
        .manager-instrument-ring-link:hover {
          background: radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.11), transparent 60%);
        }

        .manager-instrument-ring-label {
          color: #ffffff;
          font-size: 27px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-instrument-ring-sub {
          margin-top: var(--space-sm);
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

        /* 각 링을 다크 은하 위 '별'처럼 — accent 색 저농도 원형 헤일로(DOM상 아크보다 먼저라 뒤에 깔림) */
        .manager-instrument-ring::before {
          content: "";
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent, #ffffff) 26%, transparent) 0%, transparent 68%);
          pointer-events: none;
        }

        .manager-instrument-ring-arc {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px));
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

        /* 카드 폭이 좁아지는 구간(글랜스 절반 칼럼 등) — 3열이 안 들어가므로
           게이지를 첫 줄 전체 폭으로 올리고 링 2개를 아랫줄에 나란히 둔다. 링도 한 단계 축소. */
        @container (max-width: 799px) {
          .manager-instrument-gauges {
            grid-template-columns: 1fr 1fr;
          }

          .manager-instrument-gauge-column {
            grid-column: 1 / -1;
            order: -1;
          }

          .manager-instrument-ring {
            width: 160px;
            height: 160px;
          }

          .manager-instrument-ring-tick {
            transform-origin: 50% 80px;
          }

          .manager-instrument-ring-pct {
            font-size: 38px;
          }

          .manager-instrument-ring-label,
          .manager-instrument-gauge-label {
            font-size: 20px;
          }
        }

        /* 아주 좁은 카드(모바일 단일 칼럼) — 링도 세로로 쌓는다 */
        @container (max-width: 430px) {
          .manager-instrument-gauges {
            grid-template-columns: 1fr;
          }
        }

        /* ── 반원 게이지(납부율) — 링 상단정렬과 하단정렬의 중간(가운데) 높이에 둔다 ── */
        .manager-instrument-gauge {
          position: relative;
          display: grid;
          justify-items: center;
          align-self: center;
        }

        .manager-instrument-gauge::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 34px;
          width: 230px;
          height: 150px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at 50% 100%, rgba(242, 237, 255, 0.22) 0%, transparent 68%);
          pointer-events: none;
          z-index: 0;
        }

        .manager-instrument-gauge > * {
          position: relative;
        }

        /* 게이지 아래 캡션(2/5명 납부)에 윗 여백 — 숫자와 붙지 않게 */
        .manager-instrument-gauge-copy span {
          margin-top: var(--space-sm);
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
          filter: drop-shadow(0 0 12px rgba(242, 237, 255, 0.35));
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

        /* 납부율 바늘 — 밑변 중앙 피벗, 톤을 안 깨는 옅은 금빛에 은은한 글로우.
           길이 100은 반지름 120에서 아크 안쪽(≈103)에 팁이 살짝 못 미치게. */
        .manager-instrument-gauge-needle {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 3px;
          height: 100px;
          margin-left: -1.5px;
          transform-origin: 50% 100%;
          border-radius: 2px 2px 0 0;
          background: linear-gradient(to top, rgba(255, 214, 130, 0) 8%, #ffd76b 55%, #fff2c6 100%);
          box-shadow: 0 0 8px rgba(255, 208, 110, 0.75), 0 0 16px rgba(255, 196, 84, 0.4);
          pointer-events: none;
        }

        /* 바늘 회전축 허브 — 밑변 중앙의 작은 금빛 점(반원 밖 아래쪽은 overflow로 잘려 반쪽만 보임) */
        .manager-instrument-gauge-hub {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 13px;
          height: 13px;
          transform: translate(-50%, 45%);
          border-radius: 50%;
          background: radial-gradient(circle, #fff2c6 0%, #ffcf6b 55%, rgba(255, 190, 90, 0) 100%);
          box-shadow: 0 0 8px rgba(255, 205, 110, 0.7);
          pointer-events: none;
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

function InstrumentRing({ label, pct, sub, href, accent }: { label: string; pct: number | null; sub: string; href: string; accent: string }) {
  const clamped = pct == null ? null : Math.max(0, Math.min(100, pct));

  return (
    <Link href={href} className="manager-instrument-ring-link" style={{ ["--accent"]: accent } as CSSProperties}>
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
          style={{
            background: `conic-gradient(${accent} ${clamped ?? 0}%, rgba(255, 255, 255, 0.22) 0)`,
            filter: `drop-shadow(0 0 8px ${accent}55)`
          }}
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
