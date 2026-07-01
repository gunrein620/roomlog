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

export const GRID_SIZE: number;

export function snapToGrid(point: Point, gridSize?: number): Point;
export function snapToOrthogonal(start: Point, end: Point): Point;
export function createWall(start: Point, end: Point, id: string): Wall | null;
export function wallLength(wall: Wall): number;
export function distanceToWall(point: Point, wall: Wall): number;
export function findNearestWall(walls: Wall[], point: Point, maxDistance?: number): Wall | null;
export function removeWall(walls: Wall[], wallId: string): Wall[];
export function summarizeWalls(walls: Wall[]): WallSummary;
export function createStarterWalls(): Wall[];
