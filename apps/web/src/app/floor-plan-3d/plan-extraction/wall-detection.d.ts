import type { RegisteredPlanMetadata, Wall } from "../room-model/types";
import type { DetectedLine, FloorPlanCandidate, ScaleCandidate } from "./types";

export function detectWallLinesFromMask(
  mask: boolean[],
  options?: {
    width?: number;
    height?: number;
    minRunLength?: number;
    axisTolerance?: number;
    gapTolerance?: number;
    minLength?: number;
    maxLines?: number;
  }
): DetectedLine[];
export function detectWallBandLinesFromMask(
  mask: boolean[],
  options?: {
    width?: number;
    height?: number;
    minRunLength?: number;
    minWallThickness?: number;
    bandAxisGapTolerance?: number;
    bandOverlapRatio?: number;
  }
): DetectedLine[];
export function detectWallLinesFromImageData(
  imageData: ImageData,
  options?: {
    darkThreshold?: number;
    width?: number;
    height?: number;
    minRunLength?: number;
    minComponentArea?: number;
    axisTolerance?: number;
    gapTolerance?: number;
    minLength?: number;
    maxLines?: number;
    strictLineMask?: boolean;
    strictLineThreshold?: number;
    minWallThickness?: number;
    bandAxisGapTolerance?: number;
    bandOverlapRatio?: number;
  }
): DetectedLine[];
export function removeSmallWallComponents(
  mask: boolean[],
  options?: { width?: number; height?: number; minArea?: number }
): boolean[];
export function mergeDetectedWallLines(
  lines: DetectedLine[],
  options?: { axisTolerance?: number; gapTolerance?: number; minLength?: number; maxLines?: number }
): DetectedLine[];
export function removeContainedDetectedWallFragments(
  lines: DetectedLine[],
  options?: { axisTolerance?: number; containedAxisTolerance?: number; containedRangeTolerance?: number }
): DetectedLine[];
export function limitDetectedWallCandidates(
  lines: DetectedLine[],
  options?: { maxLines?: number }
): DetectedLine[];
export function filterCommercialWallCandidates(
  lines: DetectedLine[],
  options?: {
    width?: number;
    height?: number;
    axisTolerance?: number;
    gapTolerance?: number;
    minLength?: number;
    maxLines?: number;
    mode?: "balanced" | "conservative" | "wall-first";
    minConservativeWallThickness?: number;
    wallFirstGapTolerance?: number;
    wallFirstSideTolerance?: number;
    wallFirstSnapDistance?: number;
  }
): {
  walls: DetectedLine[];
  annotationCandidates: Array<{ line: DetectedLine; confidence: number; source: string }>;
  dimensionCandidates: Array<{ line: DetectedLine; confidence: number; source: string; text?: string }>;
  mainPlanBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  needsReview: boolean;
  removedNoiseCount: number;
};
export function estimateScaleCandidateFromDimensions(
  candidates: Array<{ line: DetectedLine; text?: string; label?: string; confidence?: number }>
): ScaleCandidate | null;
export function detectOpeningCandidates(input?: {
  arcs?: Array<{ x: number; y: number; radius?: number }>;
  gaps?: DetectedLine[];
  windowLines?: DetectedLine[];
  pixelToMmRatio?: number;
}): FloorPlanCandidate[];
export function updateCandidateStatus(
  candidates: FloorPlanCandidate[],
  candidateId: string,
  status: "CANDIDATE" | "CONFIRMED" | "REJECTED"
): FloorPlanCandidate[];
export function moveCandidate(
  candidates: FloorPlanCandidate[],
  candidateId: string,
  delta: { x?: number; y?: number }
): FloorPlanCandidate[];
export function detectFixtureCandidates(input?: {
  labels?: Array<{ text: string; x: number; y: number; confidence?: number }>;
  shapes?: Array<{ kind?: string; x: number; y: number; width?: number; height?: number }>;
  pixelToMmRatio?: number;
}): FloorPlanCandidate[];
export function createWallsFromDetectedLines(
  lines: DetectedLine[],
  plan?: RegisteredPlanMetadata & {
    axisTolerance?: number;
    canvasHeight?: number;
    canvasWidth?: number;
    containedRangeTolerance?: number;
    imageFillRatio?: number;
  }
): Wall[];
