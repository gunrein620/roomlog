import Link from "next/link";
import { FileClock, MessageSquareText, ReceiptText, Wrench } from "lucide-react";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";

const TILES = [
  { key: "overdue", label: "연체", href: MANAGER_CROSS.billing, Icon: ReceiptText },
  { key: "urgent", label: "긴급 하자", href: MANAGER_CROSS.ticketDash, Icon: Wrench },
  { key: "expiring", label: "만기 임박", href: MANAGER_CROSS.contract, Icon: FileClock },
  { key: "unanswered", label: "답장 대기", href: MANAGER_CROSS.messaging, Icon: MessageSquareText }
] as const;

export type AlertStatWarnings = {
  overdue: number;
  urgent: number;
  expiring: number;
  unanswered: number;
};

/**
 * 주의 항목 스탯 타일 4개 — 인디고 단일 축 농도로 심각도를 표현.
 * 색은 상태 전달을 보조할 뿐 — 아이콘·라벨·건수가 항상 함께 있어 색 단독 의존이 없다.
 */
export function AlertStatTiles({ warnings }: { warnings: AlertStatWarnings }) {
  return (
    <>
      <ul className="manager-alert-tiles" aria-label="주의 항목">
      {TILES.map(({ key, label, href, Icon }) => {
        const count = warnings[key];
        const active = count > 0;
        return (
          <li key={key}>
            <Link
              href={href}
              className={
                active
                  ? `manager-alert-tile manager-alert-tile--${key} manager-alert-tile--active`
                  : `manager-alert-tile manager-alert-tile--${key}`
              }
            >
              <span className="manager-alert-tile-top">
                <span className="manager-alert-tile-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className="manager-alert-tile-label">{label}</span>
              </span>
              <span className="manager-alert-tile-count">
                <strong>{count}</strong>건
              </span>
            </Link>
          </li>
        );
      })}
      </ul>

      <style>{`
        .manager-alert-tiles {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-md);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-alert-tiles > li {
          height: 100%;
        }

        .manager-alert-tile {
          display: grid;
          align-content: space-between;
          justify-items: center;
          gap: var(--space-lg);
          min-height: 152px;
          height: 100%;
          padding: var(--space-xl);
          border-radius: var(--radius-md);
          /* 소등 상태 — 흰 카드가 아니라 한 톤 낮춰 "꺼져 있음"을 배경으로도 드러낸다 */
          background: var(--surface-container-low);
          color: var(--on-surface-variant);
          box-shadow: var(--shadow-soft);
          text-decoration: none;
          text-align: center;
          transition: transform 0.16s ease;
        }

        .manager-alert-tile:hover {
          transform: translateY(-2px);
        }

        .manager-alert-tile-top {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-sm);
        }

        .manager-alert-tile-icon {
          width: 40px;
          height: 40px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: var(--radius);
          background: var(--surface-container);
          color: inherit;
        }

        /* 계기 이름표 — 자간 넓힌 마이크로 라벨 */
        .manager-alert-tile-label {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .manager-alert-tile-count {
          /* 커진 타일에서 좌측 정렬 숫자는 우측이 비어 보인다 — 계기 대칭으로 중앙 정렬 */
          justify-self: center;
          color: var(--on-surface);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-alert-tile--active {
          color: var(--on-surface);
        }

        .manager-alert-tile--active .manager-alert-tile-icon {
          background: rgba(255, 255, 255, 0.45);
          color: inherit;
        }

        .manager-alert-tile-count strong {
          margin-right: 2px;
          font-size: 36px;
          line-height: 1.1;
          font-weight: 800;
        }

        /* 파스텔 4색 → 인디고 단일 축 4단계(심각도 순: 긴급 하자 > 연체 > 만기 임박 > 답장 대기).
           72%는 흰 텍스트 기준 대비 4.5:1을 못 넘겨(≈3.6:1) 85%로 올렸다 — 나머지는 계산대로. */
        .manager-alert-tile--urgent.manager-alert-tile--active {
          background: var(--primary);
          color: #ffffff;
        }

        .manager-alert-tile--overdue.manager-alert-tile--active {
          background: color-mix(in srgb, var(--primary) 85%, #ffffff);
          color: #ffffff;
        }

        .manager-alert-tile--expiring.manager-alert-tile--active {
          background: color-mix(in srgb, var(--primary) 26%, #ffffff);
          color: var(--on-primary-container);
        }

        .manager-alert-tile--unanswered.manager-alert-tile--active {
          background: color-mix(in srgb, var(--primary) 12%, #ffffff);
          color: var(--on-primary-container);
        }

        @media (max-width: 620px) {
          .manager-alert-tiles {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-alert-tile {
            transition: none;
          }

          .manager-alert-tile:hover {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
