// 도면 객체 편집 helper. 컨테이너는 선택/명령만 전달하고 좌표 보정은 이 파일에서 처리한다.

import type { CandidateStatus, FloorPlanObject } from "./types";
import type { Point, Wall } from "../room-model/types";

type Bounds = { height: number; width: number; x: number; y: number };
export type ObjectCornerHandle = "ne" | "nw" | "se" | "sw";
export type OpeningSpanHandle = "end" | "start";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function objectBounds(object: FloorPlanObject) {
  return {
    height: Math.max(1, object.size.height),
    width: Math.max(1, object.size.width)
  };
}

function movePoint(point: Point, delta: Point) {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallLength(wall: Wall) {
  return distance(wall.start, wall.end);
}

function wallAxis(wall: Wall) {
  return Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y) ? "horizontal" : "vertical";
}

function spanAxis(span: { end: Point; start: Point }) {
  return Math.abs(span.end.x - span.start.x) >= Math.abs(span.end.y - span.start.y) ? "horizontal" : "vertical";
}

function scalarOnAxis(point: Point, axis: "horizontal" | "vertical") {
  return axis === "horizontal" ? point.x : point.y;
}

function crossOnAxis(point: Point, axis: "horizontal" | "vertical") {
  return axis === "horizontal" ? point.y : point.x;
}

function pointOnAxis(axis: "horizontal" | "vertical", scalar: number, cross: number): Point {
  return axis === "horizontal" ? { x: scalar, y: cross } : { x: cross, y: scalar };
}

function stableOpeningWallId(object: FloorPlanObject) {
  return String(object.attachedWallId ?? object.id).replace(/-opening(?:-[ab])?$/i, "");
}

function midpoint(a: Point, b: Point) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function openingPerpendicularSize(object: FloorPlanObject) {
  if (!object.spanOnWall) return object.size.height;
  const axis = spanAxis(object.spanOnWall);

  return axis === "horizontal" ? object.size.height : object.size.width;
}

function localCorner(object: FloorPlanObject, handle: ObjectCornerHandle) {
  const x = handle.includes("e") ? object.size.width / 2 : -object.size.width / 2;
  const y = handle.includes("s") ? object.size.height / 2 : -object.size.height / 2;

  return { x, y };
}

function rotateLocalPoint(point: Point, rotationDeg: number) {
  const angle = (rotationDeg * Math.PI) / 180;

  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
  };
}

function rotatePointAround(point: Point, center: Point, rotationDeg: number) {
  const rotated = rotateLocalPoint({ x: point.x - center.x, y: point.y - center.y }, rotationDeg);

  return {
    x: Math.round((center.x + rotated.x) * 1000) / 1000,
    y: Math.round((center.y + rotated.y) * 1000) / 1000
  };
}

function worldCorner(object: FloorPlanObject, handle: ObjectCornerHandle) {
  const local = localCorner(object, handle);
  const rotated = rotateLocalPoint(local, object.rotationDeg);

  return {
    x: object.center.x + rotated.x,
    y: object.center.y + rotated.y
  };
}

function oppositeCornerHandle(handle: ObjectCornerHandle): ObjectCornerHandle {
  if (handle === "ne") return "sw";
  if (handle === "nw") return "se";
  if (handle === "se") return "nw";

  return "ne";
}

export function findObjectAtPoint(objects: FloorPlanObject[], point: Point, tolerance = 8) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (object.status === "REJECTED") continue;
    const angle = -(object.rotationDeg * Math.PI) / 180;
    const dx = point.x - object.center.x;
    const dy = point.y - object.center.y;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    const bounds = objectBounds(object);
    if (Math.abs(localX) <= bounds.width / 2 + tolerance && Math.abs(localY) <= bounds.height / 2 + tolerance) return object;
  }

  return null;
}

export function moveObject(objects: FloorPlanObject[], objectId: string, delta: Point, bounds?: Bounds | null) {
  return objects.map((object) => {
    if (object.id !== objectId) return object;
    const nextCenter = {
      x: object.center.x + delta.x,
      y: object.center.y + delta.y
    };
    const clampedCenter = bounds
      ? {
          x: clamp(nextCenter.x, bounds.x, bounds.x + bounds.width),
          y: clamp(nextCenter.y, bounds.y, bounds.y + bounds.height)
        }
      : nextCenter;
    const appliedDelta = {
      x: clampedCenter.x - object.center.x,
      y: clampedCenter.y - object.center.y
    };

    return {
      ...object,
      center: clampedCenter,
      ...(object.spanOnWall
        ? { spanOnWall: { end: movePoint(object.spanOnWall.end, appliedDelta), start: movePoint(object.spanOnWall.start, appliedDelta) } }
        : {}),
      ...(object.swing ? { swing: { ...object.swing, opensTowards: movePoint(object.swing.opensTowards, appliedDelta) } } : {})
    };
  });
}

export function constrainOpeningDeltaToSpan(object: FloorPlanObject, delta: Point) {
  if (object.category !== "opening" || !object.spanOnWall) return delta;
  const axis = spanAxis(object.spanOnWall);

  return axis === "horizontal" ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
}

export function recutWallsForMovedOpening(walls: Wall[], originalObject: FloorPlanObject, movedObject: FloorPlanObject) {
  if (originalObject.category !== "opening" || !originalObject.spanOnWall || !movedObject.spanOnWall) return walls;
  const axis = spanAxis(originalObject.spanOnWall);
  const lineCross = (crossOnAxis(originalObject.spanOnWall.start, axis) + crossOnAxis(originalObject.spanOnWall.end, axis)) / 2;
  const originalStart = scalarOnAxis(originalObject.spanOnWall.start, axis);
  const originalEnd = scalarOnAxis(originalObject.spanOnWall.end, axis);
  const originalSpan = { end: Math.max(originalStart, originalEnd), start: Math.min(originalStart, originalEnd) };
  const lineTolerance = Math.max(18, Math.min(36, Math.max(originalObject.size.width, originalObject.size.height) * 0.8));
  const joinTolerance = Math.max(12, lineTolerance);
  const sameLineWalls = walls
    .filter((wall) => wallLength(wall) >= 1 && wallAxis(wall) === axis)
    .map((wall) => {
      const wallCross = (crossOnAxis(wall.start, axis) + crossOnAxis(wall.end, axis)) / 2;
      const start = scalarOnAxis(wall.start, axis);
      const end = scalarOnAxis(wall.end, axis);

      return { end: Math.max(start, end), start: Math.min(start, end), wall, wallCross };
    })
    .filter((entry) => Math.abs(entry.wallCross - lineCross) <= lineTolerance);

  let clusterStart = originalSpan.start;
  let clusterEnd = originalSpan.end;
  const cluster = new Set<Wall["id"]>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of sameLineWalls) {
      if (cluster.has(entry.wall.id)) continue;
      if (entry.end < clusterStart - joinTolerance || entry.start > clusterEnd + joinTolerance) continue;
      cluster.add(entry.wall.id);
      clusterStart = Math.min(clusterStart, entry.start);
      clusterEnd = Math.max(clusterEnd, entry.end);
      expanded = true;
    }
  }
  if (!cluster.size || clusterEnd - clusterStart < 1) return walls;

  const movedStart = scalarOnAxis(movedObject.spanOnWall.start, axis);
  const movedEnd = scalarOnAxis(movedObject.spanOnWall.end, axis);
  const cut = {
    end: Math.min(clusterEnd, Math.max(movedStart, movedEnd)),
    start: Math.max(clusterStart, Math.min(movedStart, movedEnd))
  };
  if (cut.end - cut.start < 8) return walls;

  const remainingWalls = walls.filter((wall) => !cluster.has(wall.id));
  const baseId = stableOpeningWallId(originalObject);
  const segments = [
    { end: cut.start, id: `${baseId}-opening-a`, start: clusterStart },
    { end: clusterEnd, id: `${baseId}-opening-b`, start: cut.end }
  ].flatMap((segment): Wall[] => {
    if (segment.end - segment.start < 12) return [];

    return [{ id: segment.id, start: pointOnAxis(axis, segment.start, lineCross), end: pointOnAxis(axis, segment.end, lineCross) }];
  });

  return [...remainingWalls, ...segments];
}

export function resizeOpeningSpan(objects: FloorPlanObject[], objectId: string, handle: OpeningSpanHandle, point: Point, minLength = 12) {
  return objects.map((object) => {
    if (object.id !== objectId || object.category !== "opening" || !object.spanOnWall) return object;
    const axis = spanAxis(object.spanOnWall);
    const cross = crossOnAxis(object.spanOnWall[handle], axis);
    const oppositeHandle = handle === "start" ? "end" : "start";
    const oppositeScalar = scalarOnAxis(object.spanOnWall[oppositeHandle], axis);
    const requestedScalar = scalarOnAxis(point, axis);
    const nextScalar = handle === "start"
      ? Math.min(requestedScalar, oppositeScalar - minLength)
      : Math.max(requestedScalar, oppositeScalar + minLength);
    const nextSpan = {
      ...object.spanOnWall,
      [handle]: pointOnAxis(axis, nextScalar, cross)
    };
    const spanLength = distance(nextSpan.start, nextSpan.end);
    const center = midpoint(nextSpan.start, nextSpan.end);

    return {
      ...object,
      center,
      size: axis === "horizontal"
        ? { height: openingPerpendicularSize(object), width: spanLength }
        : { height: spanLength, width: openingPerpendicularSize(object) },
      spanOnWall: nextSpan,
      ...(object.swing ? { swing: { ...object.swing, opensTowards: movePoint(object.swing.opensTowards, { x: center.x - object.center.x, y: center.y - object.center.y }) } } : {})
    };
  });
}

export function resizeObject(objects: FloorPlanObject[], objectId: string, handle: ObjectCornerHandle, point: Point, minSize = 8) {
  return objects.map((object) => {
    if (object.id !== objectId || object.category === "opening") return object;
    const anchor = worldCorner(object, oppositeCornerHandle(handle));
    const center = midpoint(anchor, point);
    const width = Math.max(minSize, Math.abs(point.x - anchor.x));
    const height = Math.max(minSize, Math.abs(point.y - anchor.y));

    return {
      ...object,
      center,
      size: { height, width }
    };
  });
}

export function rotateObjectQuarterTurn(objects: FloorPlanObject[], objectId: string) {
  return objects.map((object) => {
    if (object.id !== objectId) return object;
    const rotationDeg = (object.rotationDeg + 90) % 360;
    if (object.category !== "opening" || !object.spanOnWall) return { ...object, rotationDeg };

    return {
      ...object,
      rotationDeg,
      size: { height: object.size.width, width: object.size.height },
      spanOnWall: {
        end: rotatePointAround(object.spanOnWall.end, object.center, 90),
        start: rotatePointAround(object.spanOnWall.start, object.center, 90)
      },
      ...(object.swing ? { swing: { ...object.swing, opensTowards: rotatePointAround(object.swing.opensTowards, object.center, 90) } } : {})
    };
  });
}

export function updateObjectStatus(objects: FloorPlanObject[], objectId: string, status: CandidateStatus) {
  return objects.map((object) => (object.id === objectId ? { ...object, status } : object));
}

export function removeObject(objects: FloorPlanObject[], objectId: string) {
  return objects.filter((object) => object.id !== objectId);
}
