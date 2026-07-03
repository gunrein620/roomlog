// 도면 객체 편집 helper. 컨테이너는 선택/명령만 전달하고 좌표 보정은 이 파일에서 처리한다.

import type { CandidateStatus, FloorPlanObject } from "./types";
import type { Point } from "../room-model/types";

type Bounds = { height: number; width: number; x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function objectBounds(object: FloorPlanObject) {
  return {
    height: Math.max(1, object.size.height),
    width: Math.max(1, object.size.width)
  };
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
    const nextBounds = bounds ?? { height: Number.POSITIVE_INFINITY, width: Number.POSITIVE_INFINITY, x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };

    return {
      ...object,
      center: {
        x: clamp(nextCenter.x, nextBounds.x, nextBounds.x + nextBounds.width),
        y: clamp(nextCenter.y, nextBounds.y, nextBounds.y + nextBounds.height)
      }
    };
  });
}

export function rotateObjectQuarterTurn(objects: FloorPlanObject[], objectId: string) {
  return objects.map((object) =>
    object.id === objectId ? { ...object, rotationDeg: (object.rotationDeg + 90) % 360 } : object
  );
}

export function updateObjectStatus(objects: FloorPlanObject[], objectId: string, status: CandidateStatus) {
  return objects.map((object) => (object.id === objectId ? { ...object, status } : object));
}

export function removeObject(objects: FloorPlanObject[], objectId: string) {
  return objects.filter((object) => object.id !== objectId);
}
