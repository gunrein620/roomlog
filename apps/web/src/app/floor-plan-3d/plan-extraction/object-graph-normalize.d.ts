import type { Wall } from "../room-model/types";
import type { FloorPlanObject } from "./types";

export function normalizeObjectGraph(
  raw: unknown,
  options?: { imageHeight?: number; imageWidth?: number }
): {
  medianWallThicknessPx: number;
  objects: FloorPlanObject[];
  walls: Wall[];
  warnings: string[];
};
