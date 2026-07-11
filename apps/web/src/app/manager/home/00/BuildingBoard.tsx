import Link from "next/link";
import type { ManagerHomeCard } from "./dashboard-calculations";

/**
 * 건물별 운영 보드 — 건물 카드 안에 층×호실 그리드.
 * 호실 사각형 하나가 계약 하나(ManagerHomeCard)이고, 색이 상태를 말한다.
 * 상태 우선순위: 연체 > 만기 임박(D-30) > 대기 > 입금완료 > 확인불가.
 */

type UnitStatus = "overdue" | "expiring" | "waiting" | "paid" | "unknown";

const STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  overdue: { label: "연체", color: "#ff7a70" },
  expiring: { label: "만기 임박", color: "#ffc55c" },
  waiting: { label: "납부 대기", color: "#8f86c9" },
  paid: { label: "입금완료", color: "#7c8cf8" },
  unknown: { label: "확인불가", color: "rgba(255, 255, 255, 0.18)" }
};

const LEGEND_ORDER: UnitStatus[] = ["paid", "waiting", "overdue", "expiring", "unknown"];

function unitStatus(home: ManagerHomeCard): UnitStatus {
  if (home.rentStatusChip === "연체") return "overdue";
  if (home.contractDday != null && home.contractDday <= 30) return "expiring";
  if (home.rentStatusChip === "대기") return "waiting";
  if (home.rentStatusChip === "입금완료") return "paid";
  return "unknown";
}

function floorOf(unitId: string | undefined): string {
  if (!unitId || !/^\d+$/.test(unitId)) return "기타";
  return unitId.length >= 3 ? `${Number(unitId.slice(0, -2))}F` : "1F";
}

function floorSortKey(floor: string): number {
  return floor === "기타" ? -1 : Number(floor.replace("F", ""));
}

export function BuildingBoard({ homeCards }: { homeCards: ManagerHomeCard[] }) {
  const buildings = new Map<string, ManagerHomeCard[]>();
  for (const home of homeCards) {
    const key = home.buildingName?.trim() || "기타";
    const list = buildings.get(key) ?? [];
    list.push(home);
    buildings.set(key, list);
  }

  const sortedBuildings = [...buildings.entries()].sort(([a], [b]) => a.localeCompare(b, "ko-KR"));

  return (
    <div className="manager-building-board">
      {sortedBuildings.map(([buildingName, homes]) => {
        const overdueCount = homes.filter((home) => unitStatus(home) === "overdue").length;
        const expiringCount = homes.filter((home) => unitStatus(home) === "expiring").length;

        const floors = new Map<string, ManagerHomeCard[]>();
        for (const home of homes) {
          const floor = floorOf(home.unitId);
          const list = floors.get(floor) ?? [];
          list.push(home);
          floors.set(floor, list);
        }
        const sortedFloors = [...floors.entries()].sort(
          ([a], [b]) => floorSortKey(b) - floorSortKey(a)
        );

        return (
          <section key={buildingName} className="manager-building-card" aria-label={`${buildingName} 운영 현황`}>
            <header className="manager-building-header">
              <h3>{buildingName}</h3>
              <div className="manager-building-chips">
                {overdueCount > 0 ? <span className="manager-building-chip--overdue">연체 {overdueCount}</span> : null}
                {expiringCount > 0 ? <span className="manager-building-chip--expiring">만기 {expiringCount}</span> : null}
              </div>
            </header>

            <div className="manager-building-panel">
              {sortedFloors.map(([floor, floorHomes]) => (
                <div key={floor} className="manager-building-floor">
                  <span className="manager-building-floor-label">{floor}</span>
                  <div className="manager-building-units">
                    {[...floorHomes]
                      .sort((a, b) => (a.unitId ?? "").localeCompare(b.unitId ?? "", "ko-KR", { numeric: true }))
                      .map((home) => {
                        const status = unitStatus(home);
                        const label = `${home.homeName} · ${home.tenantName} · ${STATUS_META[status].label}`;
                        return (
                          <Link
                            key={home.id}
                            href={home.href}
                            className="manager-building-unit"
                            style={{ background: STATUS_META[status].color }}
                            title={label}
                            aria-label={label}
                          />
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            <ul className="manager-building-legend" aria-hidden="true">
              {LEGEND_ORDER.map((status) => (
                <li key={status}>
                  <span style={{ background: STATUS_META[status].color }} />
                  {STATUS_META[status].label}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <style>{`
        .manager-building-board {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          align-items: start;
          gap: var(--space-lg);
        }

        .manager-building-card {
          min-width: 0;
          display: grid;
          gap: var(--space-md);
          padding: var(--space-lg);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        .manager-building-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-sm);
        }

        .manager-building-header h3 {
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: var(--fs-body);
          line-height: var(--lh-body);
          font-weight: 800;
        }

        .manager-building-chips {
          display: flex;
          gap: var(--space-xs);
          flex: none;
        }

        .manager-building-chips > span {
          padding: 2px var(--space-sm);
          border-radius: var(--radius-full);
          font-size: var(--fs-caption);
          font-weight: 700;
          white-space: nowrap;
        }

        .manager-building-chip--overdue {
          background: var(--pastel-peach);
          color: var(--on-pastel-peach);
        }

        .manager-building-chip--expiring {
          background: var(--pastel-yellow);
          color: var(--on-pastel-yellow);
        }

        /* 층 패널 — 브리핑·네비와 같은 밤하늘. 건물 단면이 우주에 떠 있는 그림 */
        .manager-building-panel {
          display: grid;
          gap: var(--space-sm);
          padding: var(--space-md);
          border-radius: var(--radius);
          background: linear-gradient(150deg, #2a2153 0%, #1e1840 100%);
        }

        .manager-building-floor {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr);
          align-items: center;
          gap: var(--space-sm);
        }

        .manager-building-floor-label {
          color: rgba(244, 241, 253, 0.55);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-building-units {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .manager-building-unit {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }

        .manager-building-unit:hover {
          transform: scale(1.18);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.35);
        }

        .manager-building-legend {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs) var(--space-sm);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-building-legend li {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-building-legend li > span {
          width: 9px;
          height: 9px;
          border-radius: var(--radius-full);
        }

        /* 범례의 '확인불가'는 흰 카드 위라 밝은 회색 대신 라벤더 회색으로 */
        .manager-building-legend li:last-child > span {
          background: var(--surface-container-highest) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-building-unit {
            transition: none;
          }

          .manager-building-unit:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
