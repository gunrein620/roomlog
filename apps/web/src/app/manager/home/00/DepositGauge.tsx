import Link from "next/link";
import { ArrowUpRight, CircleDollarSign } from "lucide-react";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

export function DepositGauge({
  depositRatePct,
  monthLabel,
  payerCounts,
  failed
}: {
  depositRatePct: number | null;
  monthLabel: string;
  payerCounts: { paid: number; total: number } | null;
  failed: boolean;
}) {
  const pct = typeof depositRatePct === "number" ? Math.max(0, Math.min(100, depositRatePct)) : null;

  return (
    <section aria-labelledby="deposit-summary-title" className="manager-deposit-panel">
      <div className="manager-deposit-top">
        <div className="manager-deposit-copy">
          <div className="manager-deposit-icon" aria-hidden="true">
            <CircleDollarSign size={20} strokeWidth={2.1} />
          </div>
          <h2 id="deposit-summary-title">{monthLabel} 납부 현황</h2>
          <strong>{payerCounts ? `${payerCounts.paid} / ${payerCounts.total}명` : "확인 필요"}</strong>
        </div>
        <div
          className="manager-deposit-ring"
          role="progressbar"
          aria-label={`${monthLabel} 납부 완료율`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-valuetext={pct == null ? "납부 완료율을 확인할 수 없음" : `${pct}%`}
        >
          <span
            className="manager-deposit-ring-arc"
            style={{ background: `conic-gradient(#ffffff ${pct ?? 0}%, rgba(255, 255, 255, 0.22) 0)` }}
            aria-hidden="true"
          />
          <span className="manager-deposit-ring-value">{pct == null ? "—" : `${pct}%`}</span>
        </div>
      </div>

      {failed || payerCounts == null ? (
        <p className="manager-deposit-description">
          {failed
            ? "청구 데이터를 불러오지 못했습니다. 청구 관리에서 다시 확인해주세요."
            : "청구 대상이 없어 납부 완료율을 계산하지 않았습니다."}
        </p>
      ) : null}

      <Link href={MANAGER_CROSS.billing} className="manager-deposit-link">
        청구 관리
        <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden="true" />
      </Link>

      <style>{`
        /* 히어로 카드 — 화면에서 유일하게 솔리드 색을 쓰는 곳 (레퍼런스의 Dropbox 카드 역할) */
        .manager-deposit-panel {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: var(--space-lg);
          padding: var(--space-lg);
          border-radius: var(--radius-md);
          background: linear-gradient(140deg, #6455e2 0%, #5747cf 55%, #4b3cba 100%);
          color: #ffffff;
          box-shadow: 0 18px 44px rgba(87, 71, 207, 0.35);
        }

        .manager-deposit-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-deposit-copy {
          min-width: 0;
          display: grid;
          gap: var(--space-xs);
        }

        /* 레퍼런스의 Dropbox 카드처럼 — 흰 타일 속 브랜드색 아이콘 */
        .manager-deposit-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          margin-bottom: var(--space-xs);
          border-radius: var(--radius);
          background: #ffffff;
          color: #5747cf;
        }

        .manager-deposit-copy h2 {
          margin: 0;
          font-size: var(--fs-subtitle);
          line-height: var(--lh-subtitle);
        }

        .manager-deposit-copy strong {
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        /* 원형 게이지 — conic-gradient 링을 radial mask로 도넛화 */
        .manager-deposit-ring {
          position: relative;
          width: 72px;
          height: 72px;
          flex: none;
          display: grid;
          place-items: center;
        }

        .manager-deposit-ring-arc {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
        }

        .manager-deposit-ring-value {
          font-size: var(--fs-caption);
          font-weight: 800;
        }

        .manager-deposit-description {
          margin: 0;
          color: rgba(255, 255, 255, 0.78);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-deposit-link {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-xs);
          align-self: end;
          padding: 0 var(--space-md);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          text-decoration: none;
          font-weight: 700;
        }

        .manager-deposit-link:focus-visible {
          outline-color: #ffffff !important;
        }
      `}</style>
    </section>
  );
}
