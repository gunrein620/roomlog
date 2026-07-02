// 2D 캔버스 편집에서 쓰는 순수 벽 계산 로직. DOM/React/three.js 의존 금지.

import { createStarterWalls } from "./wall-model.mjs";
import type { Point, Wall } from "./types";
import { DEFAULT_PIXEL_TO_MM_RATIO as MODEL_PIXEL_TO_MM_RATIO, GRID_SIZE_PX as MODEL_GRID_SIZE_PX } from "./units";

export const GRID_SIZE_PX = MODEL_GRID_SIZE_PX;
export const DEFAULT_PIXEL_TO_MM_RATIO = MODEL_PIXEL_TO_MM_RATIO;

export function calculateDistance(p1: Point, p2: Point, pixelToMmRatio: number) {
  return Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) * pixelToMmRatio);
}

export function snapCanvasPoint(point: Point) {
  return {
    x: Math.round(point.x / GRID_SIZE_PX) * GRID_SIZE_PX,
    y: Math.round(point.y / GRID_SIZE_PX) * GRID_SIZE_PX
  };
}

export function projectPointOntoWall(point: Point, wall: Wall): Point {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return wall.start;

  const t = Math.max(
    0,
    Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared)
  );

  return {
    x: wall.start.x + dx * t,
    y: wall.start.y + dy * t
  };
}

export function splitWallByEraseArea(wall: Wall, eraseStart: Point, eraseEnd: Point): Wall[] {
  const parameterOnLine = (point: Point) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return 0;
    return Math.max(0, Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared));
  };
  const tStart = Math.min(parameterOnLine(eraseStart), parameterOnLine(eraseEnd));
  const tEnd = Math.max(parameterOnLine(eraseStart), parameterOnLine(eraseEnd));
  const segments: Wall[] = [];

  if (tEnd - tStart < 0.05) return [wall];

  if (tStart > 0.05) {
    segments.push({
      id: `${wall.id}-a-${Date.now()}`,
      start: wall.start,
      end: {
        x: wall.start.x + (wall.end.x - wall.start.x) * tStart,
        y: wall.start.y + (wall.end.y - wall.start.y) * tStart
      }
    });
  }

  if (tEnd < 0.95) {
    segments.push({
      id: `${wall.id}-b-${Date.now()}`,
      start: {
        x: wall.start.x + (wall.end.x - wall.start.x) * tEnd,
        y: wall.start.y + (wall.end.y - wall.start.y) * tEnd
      },
      end: wall.end
    });
  }

  return segments;
}

export function splitWallByRatio(wall: Wall, centerRatio: number): Wall[] {
  const wallPixels = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (wallPixels < GRID_SIZE_PX * 2) return [wall];

  const eraseRatio = Math.max(0.1, Math.min(0.28, (GRID_SIZE_PX * 2) / wallPixels));
  const tStart = Math.max(0, centerRatio - eraseRatio / 2);
  const tEnd = Math.min(1, centerRatio + eraseRatio / 2);

  return splitWallByEraseArea(
    wall,
    {
      x: wall.start.x + (wall.end.x - wall.start.x) * tStart,
      y: wall.start.y + (wall.end.y - wall.start.y) * tStart
    },
    {
      x: wall.start.x + (wall.end.x - wall.start.x) * tEnd,
      y: wall.start.y + (wall.end.y - wall.start.y) * tEnd
    }
  );
}

export function getStarterWalls(): Wall[] {
  return createStarterWalls() as Wall[];
}
