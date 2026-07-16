"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UNASSIGNED_BUILDING_FILTER } from "@/lib/messaging-building-filter";

type BuildingFilterProps = {
  activeBuilding: string;
  buildingOptions: string[];
  showUnassigned: boolean;
};

export function BuildingFilter({
  activeBuilding,
  buildingOptions,
  showUnassigned,
}: BuildingFilterProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function changeBuilding(nextBuilding: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextBuilding) params.set("building", nextBuilding);
    else params.delete("building");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <label
      style={{
        flex: "0 1 280px",
        minWidth: "min(100%, 220px)",
        display: "grid",
        gap: "var(--space-xs)",
        color: "var(--on-surface-variant)",
        fontSize: "var(--fs-caption)",
        fontWeight: 800,
      }}
    >
      건물 선택
      <select
        aria-label="메시지 티켓 건물 선택"
        value={activeBuilding}
        onChange={(event) => changeBuilding(event.target.value)}
        style={{
          width: "100%",
          minHeight: "var(--touch-target)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-btn)",
          padding: "0 var(--space-md)",
          background: "var(--surface-container-lowest)",
          color: "var(--on-surface)",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        <option value="">전체 건물</option>
        {buildingOptions.map((building) => (
          <option key={building} value={building}>{building}</option>
        ))}
        {showUnassigned ? (
          <option value={UNASSIGNED_BUILDING_FILTER}>건물 미지정</option>
        ) : null}
      </select>
    </label>
  );
}
