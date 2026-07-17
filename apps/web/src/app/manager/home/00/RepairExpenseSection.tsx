import Link from "next/link";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import type {
  DashboardRepairExpenseRow,
  DashboardRepairExpenseSummary
} from "./dashboard-calculations";

export function RepairExpenseSection({
  repairExpenses
}: {
  repairExpenses: DashboardRepairExpenseSummary | null;
}) {
  return (
    <section aria-labelledby="manager-repair-expenses-title" className="manager-repair-expenses">
      <div className="manager-repair-expenses-head">
        <div>
          <p>{repairExpenses ? monthLabel(repairExpenses.month) : "이번 달"} 실제 비용 원장</p>
          <h2 id="manager-repair-expenses-title">수리비 지출</h2>
        </div>
        <Link href={MANAGER_COST_ROUTES["M-COST-00"]}>비용 원장 보기</Link>
      </div>

      <div className="manager-repair-expenses-card">
        <div className="manager-repair-expenses-total">
          <span>관리자 부담 합계</span>
          <strong>{repairExpenses ? won(repairExpenses.totalAmount) : "확인 필요"}</strong>
          <small>월세 청구·수납과 별도로 관리되는 지출입니다.</small>
        </div>

        <div className="manager-repair-expenses-recent">
          <h3>최근 수리비</h3>
          {repairExpenses ? (
            <RepairRows rows={repairExpenses.recent} />
          ) : (
            <p role="status" className="manager-repair-expenses-empty">
              수리비 내역을 불러오지 못했습니다. 비용 원장에서 다시 확인해주세요.
            </p>
          )}
        </div>
      </div>

      <style>{`
        .manager-repair-expenses {
          display: grid;
          gap: var(--space-md);
        }

        .manager-repair-expenses-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-lg);
        }

        .manager-repair-expenses-head p,
        .manager-repair-expenses-head h2,
        .manager-repair-expenses-recent h3,
        .manager-repair-expenses-empty {
          margin: 0;
        }

        .manager-repair-expenses-head p {
          margin-bottom: var(--space-xs);
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-repair-expenses-head h2 {
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-repair-expenses-head a {
          color: var(--primary);
          font-size: var(--fs-caption);
          font-weight: 800;
          text-decoration: none;
        }

        .manager-repair-expenses-card {
          display: grid;
          grid-template-columns: minmax(220px, 0.34fr) minmax(0, 1fr);
          gap: var(--space-xl);
          padding: var(--space-xl);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        .manager-repair-expenses-total {
          display: grid;
          align-content: start;
          gap: var(--space-sm);
          padding-right: var(--space-xl);
          border-right: 1px solid var(--border);
        }

        .manager-repair-expenses-total > span,
        .manager-repair-expenses-total > small {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
        }

        .manager-repair-expenses-total > strong {
          font-size: var(--fs-display);
          line-height: var(--lh-display);
          font-variant-numeric: tabular-nums;
        }

        .manager-repair-expenses-recent {
          min-width: 0;
          display: grid;
          gap: var(--space-sm);
        }

        .manager-repair-expenses-recent h3 {
          font-size: var(--fs-subtitle);
        }

        .manager-repair-expenses-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-repair-expenses-row {
          display: grid;
          grid-template-columns: 72px minmax(76px, auto) minmax(140px, 1fr) auto auto;
          align-items: center;
          gap: var(--space-md);
          min-height: 44px;
          border-top: 1px solid var(--border);
          font-size: var(--fs-caption);
        }

        .manager-repair-expenses-row:first-child {
          border-top: 0;
        }

        .manager-repair-expenses-row > span:not(.manager-repair-expenses-item) {
          color: var(--on-surface-variant);
        }

        .manager-repair-expenses-item,
        .manager-repair-expenses-amount {
          color: var(--on-surface);
          font-weight: 800;
        }

        .manager-repair-expenses-amount {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .manager-repair-expenses-payment {
          padding: 2px var(--space-sm);
          border-radius: var(--radius-full);
          background: var(--surface-container);
          white-space: nowrap;
        }

        .manager-repair-expenses-empty {
          padding: var(--space-lg) 0;
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
        }

        @media (max-width: 940px) {
          .manager-repair-expenses-card {
            grid-template-columns: 1fr;
          }

          .manager-repair-expenses-total {
            padding-right: 0;
            padding-bottom: var(--space-lg);
            border-right: 0;
            border-bottom: 1px solid var(--border);
          }

          .manager-repair-expenses-row {
            grid-template-columns: 64px 76px minmax(120px, 1fr) auto;
          }

          .manager-repair-expenses-payment {
            grid-column: 3 / -1;
            justify-self: start;
            margin-bottom: var(--space-sm);
          }
        }

        @media (max-width: 620px) {
          .manager-repair-expenses-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .manager-repair-expenses-row {
            grid-template-columns: 1fr auto;
            gap: var(--space-xs) var(--space-md);
            padding: var(--space-sm) 0;
          }

          .manager-repair-expenses-item,
          .manager-repair-expenses-payment {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </section>
  );
}

function RepairRows({ rows }: { rows: DashboardRepairExpenseRow[] }) {
  if (rows.length === 0) {
    return <p className="manager-repair-expenses-empty">기록된 수리비가 없습니다.</p>;
  }

  return (
    <ul className="manager-repair-expenses-list">
      {rows.map((row) => (
        <li key={row.id} className="manager-repair-expenses-row">
          <span>{dateLabel(row.date)}</span>
          <span>{unitLabel(row.unitId)}</span>
          <span className="manager-repair-expenses-item">{row.item}</span>
          <strong className="manager-repair-expenses-amount">{won(row.amount)}</strong>
          <span className="manager-repair-expenses-payment">{paymentLabel(row.repairPayment)}</span>
        </li>
      ))}
    </ul>
  );
}

function monthLabel(month: string): string {
  const value = Number(month.slice(5, 7));
  return Number.isFinite(value) && value > 0 ? `${value}월` : "이번 달";
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul"
  }).format(date);
}

function unitLabel(unitId?: string): string {
  if (!unitId) return "호실 미정";
  return unitId.endsWith("호") ? unitId : `${unitId}호`;
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function paymentLabel(state?: DashboardRepairExpenseRow["repairPayment"]): string {
  if (state === "already_paid") return "지급 완료";
  if (state === "unpaid") return "지급 대기";
  return "지급 상태 미확인";
}
