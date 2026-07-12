import type { Thread } from "@roomlog/types";

export const UNASSIGNED_BUILDING_FILTER = "__roomlog_unassigned__";

function normalizedBuildingName(thread: Pick<Thread, "buildingName">): string {
  return thread.buildingName?.trim() ?? "";
}

export function getBuildingOptions(threads: Thread[]): string[] {
  return Array.from(
    new Set(threads.map(normalizedBuildingName).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "ko"));
}

export function hasUnassignedBuilding(threads: Thread[]): boolean {
  return threads.some((thread) => !normalizedBuildingName(thread));
}

export function resolveBuildingFilter(
  requested: string | undefined,
  buildingOptions: string[],
  hasUnassigned: boolean,
): string {
  if (!requested) return "";
  if (requested === UNASSIGNED_BUILDING_FILTER) {
    return hasUnassigned ? requested : "";
  }

  return buildingOptions.includes(requested) ? requested : "";
}

export function filterThreadsByBuilding(
  threads: Thread[],
  activeFilter: string,
): Thread[] {
  if (!activeFilter) return threads;
  if (activeFilter === UNASSIGNED_BUILDING_FILTER) {
    return threads.filter((thread) => !normalizedBuildingName(thread));
  }

  return threads.filter(
    (thread) => normalizedBuildingName(thread) === activeFilter,
  );
}
