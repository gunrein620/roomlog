import type { ExtractionMeta, FloorPlanCandidate, FloorPlanObject, UploadedFloorPlanSource } from "../plan-extraction/types";
import type { PlacedFurniture, Point, Wall } from "./types";

export type CanvasContentBounds = {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
};

type CanvasScrollMetrics = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
};

type CanvasViewportSize = {
  height: number;
  width: number;
};

export function centerCanvasScrollPosition(metrics: CanvasScrollMetrics) {
  return {
    left: Math.max(0, Math.round((metrics.scrollWidth - metrics.clientWidth) / 2)),
    top: Math.max(0, Math.round((metrics.scrollHeight - metrics.clientHeight) / 2))
  };
}

export function createCanvasContentBounds(walls: Wall[]): CanvasContentBounds | null {
  const points = walls.flatMap((wall) => [wall.start, wall.end]);
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    height: maxY - minY,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX
  };
}

export function fitCanvasContentView(
  bounds: CanvasContentBounds | null,
  viewport: CanvasViewportSize,
  options: { maxScale?: number; paddingPx?: number } = {}
) {
  if (!bounds) return { viewOffset: { x: 0, y: 0 }, viewScale: 1 };

  const maxScale = options.maxScale ?? 1;
  const paddingPx = options.paddingPx ?? 80;
  const availableWidth = Math.max(1, viewport.width - paddingPx * 2);
  const availableHeight = Math.max(1, viewport.height - paddingPx * 2);
  const safeWidth = Math.max(1, bounds.width);
  const safeHeight = Math.max(1, bounds.height);
  const fitsWithoutScaling = safeWidth <= viewport.width && safeHeight <= viewport.height;
  const viewScale = fitsWithoutScaling ? maxScale : Math.min(maxScale, availableWidth / safeWidth, availableHeight / safeHeight);
  const roundedScale = Math.max(0.1, Math.round(viewScale * 100) / 100);
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return {
    viewOffset: { x: -centerX, y: -centerY },
    viewScale: roundedScale
  };
}

export function createEmptyFloorPlanExtractionMeta(): ExtractionMeta {
  return {
    annotationCandidateCount: 0,
    detectedWallCount: 0,
    dimensionCandidateCount: 0,
    needsReview: false,
    ocrStatus: "manual-scale-required",
    removedNoiseCount: 0,
    scaleCandidates: [],
    scaleConfirmed: false
  };
}

export function createFreshFloorPlanCanvasSession(): {
  detectedObjects: FloorPlanObject[];
  extractionMeta: ExtractionMeta;
  fixtureCandidates: FloorPlanCandidate[];
  floorPlanDraftId: string | null;
  hiddenWallIds: Set<string>;
  lastExtractionMs: number | null;
  objectGraphWallThicknessPx: number;
  openingCandidates: FloorPlanCandidate[];
  pendingFurniture: PlacedFurniture | null;
  placedFurnitures: PlacedFurniture[];
  selectedFurnitureId: string | null;
  selectedObjectId: string | null;
  selectedWall: Wall | null;
  uploadedAiImageDataUrl: string | null;
  uploadedFloorPlanSource: UploadedFloorPlanSource | null;
  uploadedImage: string | null;
  viewMode: "2d";
  viewOffset: Point;
  viewScale: number;
  walls: Wall[];
} {
  return {
    detectedObjects: [],
    extractionMeta: createEmptyFloorPlanExtractionMeta(),
    fixtureCandidates: [],
    floorPlanDraftId: null,
    hiddenWallIds: new Set(),
    lastExtractionMs: null,
    objectGraphWallThicknessPx: 12,
    openingCandidates: [],
    pendingFurniture: null,
    placedFurnitures: [],
    selectedFurnitureId: null,
    selectedObjectId: null,
    selectedWall: null,
    uploadedAiImageDataUrl: null,
    uploadedFloorPlanSource: null,
    uploadedImage: null,
    viewMode: "2d",
    viewOffset: { x: 0, y: 0 },
    viewScale: 1,
    walls: []
  };
}
