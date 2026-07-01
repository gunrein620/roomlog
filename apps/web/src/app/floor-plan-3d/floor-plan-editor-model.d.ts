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

export const GRID_SIZE: number;
export const DEFAULT_WALL_HEIGHT: number;
export const DEFAULT_WALL_DEPTH: number;

export function snapToGrid(point: Point, gridSize?: number): Point;
export function snapToOrthogonal(start: Point, end: Point): Point;
export function createWall(start: Point, end: Point, id: string): Wall | null;
export function wallLength(wall: Wall): number;
export function distanceToWall(point: Point, wall: Wall): number;
export function findNearestWall(walls: Wall[], point: Point, maxDistance?: number): Wall | null;
export function removeWall(walls: Wall[], wallId: string): Wall[];
export function summarizeWalls(walls: Wall[]): WallSummary;
export function projectPointTo3D(point: Point, z?: number): ProjectedPoint;
export function convertWallTo3D(wall: Wall, options?: { height?: number; depth?: number }): WallPanel3D;
export function convertWallsTo3D(walls: Wall[], options?: { height?: number; depth?: number }): ConvertedFloorPlan3D;
export function createStarterWalls(): Wall[];
