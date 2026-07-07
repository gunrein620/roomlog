// dimension-layout.mjs 타입 선언. .mjs의 `param = []` 기본값을 TS가 never[]로 추론해
// 호출부마다 as never 캐스트가 강제되던 것을 막는다.
// 주의: .mjs용 선언 파일은 .d.mts 확장자여야 적용된다(.d.ts는 무시됨).
import type { Wall } from "../room-model/types";

export type DimensionLayoutChip = {
  alongCoord: number;
  id: string;
  perpCoord: number;
  realLengthMm: number;
};

export type StructuralBoundaries = {
  horizontalLineY: number[];
  verticalLineX: number[];
};

export function clusterDimensionRows<TChip extends { perpCoord: number }>(chips?: TChip[], perpTolerance?: number): TChip[][];
export function solveDimensionRowChains(
  chips?: DimensionLayoutChip[],
  planSpanMm?: number,
  options?: { allowEdgeAnchoredPartial?: boolean; alongEnd?: number; alongStart?: number; edgeFraction?: number; perpTolerance?: number }
): Map<string, { endMm: number; startMm: number }>;
export function structuralBoundaryOffsetsMm(
  chips?: DimensionLayoutChip[],
  planSpanMm?: number,
  options?: { allowEdgeAnchoredPartial?: boolean; alongEnd?: number; alongStart?: number; mergeToleranceMm?: number; perpTolerance?: number }
): number[];
export function filterRatioSamplesNearExpected<TSample>(samples?: TSample[], expectedRatio?: number | null, tolerance?: number): TSample[];
export function mergeCoordinates(coords?: number[], tolerance?: number): number[];
export function snapWallsToStructuralBoundaries(
  walls?: Wall[],
  boundaries?: Partial<StructuralBoundaries>,
  tolerancePx?: number,
  options?: { applyFaceOffset?: boolean }
): { movedCount: number; walls: Wall[] };
export function inferMissingWallsFromStructuralBoundaries(
  walls?: Wall[],
  boundaries?: Partial<StructuralBoundaries>,
  tolerancePx?: number,
  options?: { minWallLengthPx?: number }
): { createdCount: number; createdWalls: Wall[]; walls: Wall[] };
