import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";

/** 입주 현황 — 납부 카드와 같은 해부구조의 흰색 변주 (계약 중 / 계약 중 + 노출 중 매물). */
export function OccupancyCard({
  contractedCount,
  vacantCount,
  failed
}: {
  contractedCount: number;
  vacantCount: number;
  failed: boolean;
}) {
  const total = contractedCount + vacantCount;
  const pct = total > 0 ? Math.round((contractedCount / total) * 100) : null;

  return (
    <section aria-labelledby="occupancy-summary-title" className="manager-occupancy-panel">
      <div className="manager-occupancy-top">
        <div className="manager-occupancy-copy">
          <div className="manager-occupancy-icon" aria-hidden="true">
            <Building2 size={20} strokeWidth={2.1} />
          </div>
          <h2 id="occupancy-summary-title">입주 현황</h2>
          <strong>{failed ? "확인 필요" : `${contractedCount} / ${total}곳`}</strong>
        </div>
        <div
          className="manager-occupancy-ring"
          role="progressbar"
          aria-label="입주율"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={failed ? undefined : (pct ?? undefined)}
          aria-valuetext={failed || pct == null ? "입주율을 확인할 수 없음" : `${pct}%`}
        >
          <span
            className="manager-occupancy-ring-arc"
            style={{ background: `conic-gradient(var(--primary) ${failed ? 0 : (pct ?? 0)}%, var(--primary-container) 0)` }}
            aria-hidden="true"
          />
          <span className="manager-occupancy-ring-value">{failed || pct == null ? "—" : `${pct}%`}</span>
        </div>
      </div>

      {failed ? (
        <p className="manager-occupancy-description">
          매물 데이터를 불러오지 못했습니다. 건물 관리에서 다시 확인해주세요.
        </p>
      ) : null}

      <Link href={MHOME_ROUTES["M-HOME-03"]} className="manager-occupancy-link">
        건물 관리
        <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden="true" />
      </Link>

      <style>{`
        .manager-occupancy-panel {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: var(--space-lg);
          padding: var(--space-lg);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        .manager-occupancy-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-occupancy-copy {
          min-width: 0;
          display: grid;
          gap: var(--space-xs);
        }

        .manager-occupancy-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          margin-bottom: var(--space-xs);
          border-radius: var(--radius);
          background: var(--primary-container);
          color: var(--primary);
        }

        .manager-occupancy-copy h2 {
          margin: 0;
          font-size: var(--fs-subtitle);
          line-height: var(--lh-subtitle);
        }

        .manager-occupancy-copy strong {
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-occupancy-ring {
          position: relative;
          width: 72px;
          height: 72px;
          flex: none;
          display: grid;
          place-items: center;
        }

        .manager-occupancy-ring-arc {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-full);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
        }

        .manager-occupancy-ring-value {
          font-size: var(--fs-caption);
          font-weight: 800;
        }

        .manager-occupancy-description {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-occupancy-link {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-xs);
          align-self: end;
          padding: 0 var(--space-md);
          border-radius: var(--radius-full);
          background: var(--chip-bg);
          color: var(--chip-on);
          text-decoration: none;
          font-weight: 700;
        }
      `}</style>
    </section>
  );
}
