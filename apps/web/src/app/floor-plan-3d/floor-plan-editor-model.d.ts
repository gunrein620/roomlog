export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
}

export interface WallSummary {
  wallCount: number;
  approximateMeters: number;
  status: "초안" | "편집중";
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface WallPanel3D {
  id: string;
  height: number;
  depth: number;
  path: string;
  topLine: {
    start: ProjectedPoint;
    end: ProjectedPoint;
  };
}

export interface WallBox3D {
  id: string;
  height: number;
  depth: number;
  frontPath: string;
  topPath: string;
  startCapPath: string;
  endCapPath: string;
  sortY: number;
  topLine: {
    start: ProjectedPoint;
    end: ProjectedPoint;
  };
}

export interface ConvertedFloorPlan3D {
  wallPanels: WallPanel3D[];
  wallBoxes: WallBox3D[];
  floor: {
    path: string;
  };
}

export interface WheretoputSimulatorWall {
  id: string;
  wall_id: string;
  start: Point;
  end: Point;
  length: number;
  height: number;
  depth: number;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  wall_order: number | null;
}

export interface RegisteredPlanMetadata {
  name?: string;
  width?: number;
  height?: number;
}

export interface DetectedWallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation?: "horizontal" | "vertical";
  thickness?: number;
  markers?: string[];
  confidence?: number;
}

export interface FloorPlanCandidate {
  id: string;
  type: string;
  status: "CANDIDATE" | "CONFIRMED" | "REJECTED";
  confidence?: number;
  source?: string;
  position?: Point;
  widthMm?: number;
  sizeMm?: { width?: number; depth?: number };
  label?: string;
  movable?: boolean;
}

export interface ScaleCandidate {
  confidence: number;
  line: DetectedWallLine;
  pixelLength: number;
  pixelToMmRatio: number;
  realLengthMm: number;
  source: "outside-dimension-ocr";
}

export const GRID_SIZE: number;
export const DEFAULT_WALL_HEIGHT: number;
export const DEFAULT_WALL_DEPTH: number;
export const DEFAULT_PIXEL_TO_METER_RATIO: number;
export const WHERETOPUT_WALL_HEIGHT: number;
export const WHERETOPUT_WALL_DEPTH: number;

export function snapToGrid(point: Point, gridSize?: number): Point;
export function snapToOrthogonal(start: Point, end: Point): Point;
export function createWall(start: Point, end: Point, id: string): Wall | null;
export function wallLength(wall: Wall): number;
export function distanceToWall(point: Point, wall: Wall): number;
export function findNearestWall(walls: Wall[], point: Point, maxDistance?: number): Wall | null;
export function removeWall(walls: Wall[], wallId: string): Wall[];
export function summarizeWalls(walls: Wall[]): WallSummary;
export function projectPointTo3D(
  point: Point,
  z?: number,
  camera?: { yaw?: number; pitch?: number; center?: Point }
): ProjectedPoint;
export function convertWallTo3D(
  wall: Wall,
  options?: { height?: number; depth?: number; camera?: { yaw?: number; pitch?: number; center?: Point } }
): WallPanel3D;
export function convertWallTo3DBox(
  wall: Wall,
  options?: { height?: number; depth?: number; camera?: { yaw?: number; pitch?: number; center?: Point } }
): WallBox3D;
export function convertWallsTo3D(
  walls: Wall[],
  options?: { height?: number; depth?: number; camera?: { yaw?: number; pitch?: number; center?: Point } }
): ConvertedFloorPlan3D;
export function convertWallToWheretoputSimulator(
  wall: Wall,
  options?: { height?: number; depth?: number; pixelToMeterRatio?: number; wallOrder?: number | null }
): WheretoputSimulatorWall;
export function convertWallsToWheretoputSimulator(
  walls: Wall[],
  options?: { height?: number; depth?: number; pixelToMeterRatio?: number }
): WheretoputSimulatorWall[];
export function convertWallsToWheretoputRoom3D(
  walls: Wall[],
  options?: { height?: number; depth?: number; pixelToMmRatio?: number }
): Array<
  WheretoputSimulatorWall & {
    material: "wall";
    original2D: Wall;
  }
>;
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
): DetectedWallLine[];
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
  }
): DetectedWallLine[];
export function removeSmallWallComponents(
  mask: boolean[],
  options?: { width?: number; height?: number; minArea?: number }
): boolean[];
export function mergeDetectedWallLines(
  lines: DetectedWallLine[],
  options?: { axisTolerance?: number; gapTolerance?: number; minLength?: number; maxLines?: number }
): DetectedWallLine[];
export function limitDetectedWallCandidates(
  lines: DetectedWallLine[],
  options?: { maxLines?: number }
): DetectedWallLine[];
export function filterCommercialWallCandidates(
  lines: DetectedWallLine[],
  options?: { width?: number; height?: number; axisTolerance?: number; gapTolerance?: number; minLength?: number; maxLines?: number }
): { walls: DetectedWallLine[]; dimensionCandidates: Array<{ line: DetectedWallLine; confidence: number; source: string }>; removedNoiseCount: number };
export function estimateScaleCandidateFromDimensions(
  candidates: Array<{ line: DetectedWallLine; text?: string; label?: string; confidence?: number }>
): ScaleCandidate | null;
export function detectOpeningCandidates(input?: {
  arcs?: Array<{ x: number; y: number; radius?: number }>;
  gaps?: DetectedWallLine[];
  windowLines?: DetectedWallLine[];
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
  delta: Point
): FloorPlanCandidate[];
export function detectFixtureCandidates(input?: {
  labels?: Array<{ text: string; x: number; y: number; confidence?: number }>;
  shapes?: Array<{ kind?: string; x: number; y: number; width?: number; height?: number }>;
  pixelToMmRatio?: number;
}): FloorPlanCandidate[];
export function createWallsFromDetectedLines(
  lines: DetectedWallLine[],
  plan?: RegisteredPlanMetadata
): Wall[];
export function createWallsFromRegisteredPlan(plan?: RegisteredPlanMetadata): Wall[];
export function createStarterWalls(): Wall[];
