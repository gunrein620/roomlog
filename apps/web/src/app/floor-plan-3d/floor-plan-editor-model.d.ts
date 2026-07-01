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

export interface ConvertedFloorPlan3D {
  wallPanels: WallPanel3D[];
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
export function detectWallLinesFromMask(
  mask: boolean[],
  options?: { width?: number; height?: number; minRunLength?: number }
): DetectedWallLine[];
export function detectWallLinesFromImageData(
  imageData: ImageData,
  options?: { darkThreshold?: number; width?: number; height?: number; minRunLength?: number }
): DetectedWallLine[];
export function createWallsFromDetectedLines(
  lines: DetectedWallLine[],
  plan?: RegisteredPlanMetadata
): Wall[];
export function createWallsFromRegisteredPlan(plan?: RegisteredPlanMetadata): Wall[];
export function createStarterWalls(): Wall[];
