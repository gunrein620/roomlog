import type { Thread } from "@roomlog/types";

export function formatThreadLocation(
  thread: Pick<Thread, "buildingName" | "unitId">,
): string {
  const buildingName = thread.buildingName?.trim();
  const unit = thread.unitId.trim().replace(/호$/u, "");
  const unitLabel = `${unit}호`;

  return buildingName ? `${buildingName} · ${unitLabel}` : unitLabel;
}
