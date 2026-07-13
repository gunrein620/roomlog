export type PortfolioAmounts = {
  depositManwon: number;
  monthlyRentManwon: number;
  contractCount: number;
};

/** 자산 스탯 카드 2장 — 계기 패널 바로 아래, 총 보증금·월 예상수익을 흰 카드로 요약. */
export function PortfolioStatCards({ amounts }: { amounts: PortfolioAmounts | null }) {
  const caption = amounts ? `계약 ${amounts.contractCount}건 기준` : "확인 필요";

  return (
    <div className="manager-portfolio-stats">
      <PortfolioStatCard label="총 보증금" value={amounts ? formatManwon(amounts.depositManwon) : null} caption={caption} />
      <PortfolioStatCard label="월 예상수익" value={amounts ? formatManwon(amounts.monthlyRentManwon) : null} caption={caption} />

      <style>{`
        .manager-portfolio-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-md);
        }

        .manager-portfolio-stat-card {
          display: grid;
          gap: var(--space-xs);
          padding: var(--space-xl);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        /* 계기 이름표 — 자간 넓힌 마이크로 라벨 */
        .manager-portfolio-stat-label {
          color: var(--on-surface-variant);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-portfolio-stat-value {
          font-variant-numeric: tabular-nums;
          font-size: 32px;
          line-height: 1.15;
          font-weight: 800;
          color: var(--on-surface);
        }

        .manager-portfolio-stat-caption {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
        }

        @media (max-width: 480px) {
          .manager-portfolio-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function PortfolioStatCard({ label, value, caption }: { label: string; value: string | null; caption: string }) {
  return (
    <div className="manager-portfolio-stat-card">
      <span className="manager-portfolio-stat-label">{label}</span>
      <strong className="manager-portfolio-stat-value">{value ?? "—"}</strong>
      <span className="manager-portfolio-stat-caption">{caption}</span>
    </div>
  );
}

// 만원 단위 숫자 → 억/만원 표기. 1억(10,000만원) 이상이면 억 단위(정수면 소수 생략), 미만이면 만원 그대로.
function formatManwon(manwon: number): string {
  if (manwon >= 10000) {
    const eok = Math.round((manwon / 10000) * 10) / 10;
    return `${Number.isInteger(eok) ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  return `${manwon.toLocaleString("ko-KR")}만원`;
}
