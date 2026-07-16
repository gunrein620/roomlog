import { BuildingBoard } from "./BuildingBoard";
import type { DashboardListing, ManagerHomeCard } from "./dashboard-calculations";

export function HomeCards({
  homeCards,
  uncontractedListings
}: {
  homeCards: ManagerHomeCard[];
  uncontractedListings: DashboardListing[];
}) {
  return (
    <section aria-labelledby="managed-homes-title" className="manager-portfolio-section">
      <div className="manager-portfolio-heading">
        <h2 id="managed-homes-title">관리 중인 집</h2>
        <span>계약 체결 기준 · {homeCards.length}곳</span>
      </div>

      {homeCards.length === 0 ? (
        <div role="status" className="manager-portfolio-empty">
          <strong>계약 중인 집이 아직 없습니다</strong>
          <span>매물 채팅에서 계약이 수락되면 이곳에 표시됩니다.</span>
        </div>
      ) : (
        <BuildingBoard homeCards={homeCards} />
      )}

      <section aria-labelledby="uncontracted-listings-title" className="manager-listings-section">
        <div className="manager-listings-heading">
          <h3 id="uncontracted-listings-title">미계약 매물</h3>
          <span>{uncontractedListings.length}건</span>
        </div>
        {uncontractedListings.length === 0 ? (
          <p className="manager-listings-empty">현재 노출 중인 미계약 매물이 없습니다.</p>
        ) : (
          <ul className="manager-listings-list">
            {uncontractedListings.map((listing) => (
              <li key={listing.id}>
                <span>
                  <strong>{listing.title}</strong>
                  <small>
                    {listing.location} · 사진 {listing.photoCount}장{listing.has3D ? " · 3D 연결" : ""}
                  </small>
                </span>
                <strong>{listing.priceLabel}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .manager-portfolio-section {
          min-width: 0;
          display: grid;
          gap: var(--space-md);
        }

        .manager-portfolio-heading,
        .manager-listings-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-lg);
        }

        .manager-portfolio-heading h2,
        .manager-listings-heading h3 {
          margin: 0;
        }

        .manager-portfolio-heading h2 {
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-portfolio-heading > span,
        .manager-listings-heading > span {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-portfolio-empty {
          display: grid;
          gap: var(--space-xs);
          padding: var(--space-lg);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--pastel-blue);
          box-shadow: var(--shadow-soft);
        }

        .manager-portfolio-empty > span,
        .manager-listings-empty,
        .manager-listings-list small {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-listings-section {
          display: grid;
          gap: var(--space-sm);
          padding-top: var(--space-sm);
        }

        /* 미계약 매물은 위계상 관리 중인 집의 하위 섹션 — 다른 헤딩보다 한 급 아래로 */
        .manager-listings-heading h3 {
          font-size: var(--fs-subtitle);
          line-height: var(--lh-subtitle);
        }

        .manager-listings-empty {
          margin: 0;
        }

        .manager-listings-list {
          display: grid;
          gap: var(--space-xs);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-listings-list > li {
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-md);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        .manager-listings-list > li > span {
          min-width: 0;
          display: grid;
          gap: var(--space-xs);
        }

        .manager-listings-list :is(strong, small) {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 420px) {
          .manager-portfolio-heading,
          .manager-listings-heading,
          .manager-listings-list > li {
            align-items: flex-start;
          }

          .manager-listings-list > li {
            flex-direction: column;
          }
        }

      `}</style>
    </section>
  );
}
