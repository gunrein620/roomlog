import type {
  ConvertedFloorPlan3D,
  Point,
  RegisteredPlanMetadata,
  Wall,
  WallBox3D,
  WallPanel3D,
  WallSummary,
  WheretoputSimulatorWall,
  ProjectedPoint
} from "./types";

export const GRID_SIZE: number;
export const DEFAULT_WALL_HEIGHT: number;
export const DEFAULT_WALL_DEPTH: number;
export const DEFAULT_PIXEL_TO_MM_RATIO: number;
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
export function normalizePlanName(name?: string): string;
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
  options?: { height?: number; depth?: number; pixelToMmRatio?: number; stableIds?: boolean }
): Array<
  WheretoputSimulatorWall & {
    material: "wall";
    original2D: Wall;
  }
>;
export function convertOptimizedWallsToWheretoputRoom3D(
  walls: Wall[],
  options?: {
    depth?: number;
    gapTolerancePx?: number;
    height?: number;
    mergeCollinear?: boolean;
    pixelToMmRatio?: number;
    stableIds?: boolean;
    tolerancePx?: number;
  }
): Array<
  WheretoputSimulatorWall & {
    material: "wall";
    original2D: Wall;
  }
>;
export function buildClosedLoopFloorPolygons(
  walls: Wall[],
  options?: { pixelToMmRatio?: number; tolerancePx?: number }
): Array<{
  perimeterMeters: number;
  points: Array<{ x: number; z: number }>;
  wallIds: Array<Wall["id"]>;
}>;
export function createWallsFromRegisteredPlan(plan?: RegisteredPlanMetadata): Wall[];
export function createStarterWalls(): Wall[];
