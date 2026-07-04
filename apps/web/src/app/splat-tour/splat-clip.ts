import type { Vector3 } from "three";

export type SplatClipPoint = Pick<Vector3, "x" | "y" | "z">;

export interface SplatClipRoom {
  width: number;
  depth: number;
  height: number;
}

export interface SplatClipBox {
  min: SplatClipPoint;
  max: SplatClipPoint;
  margin: number;
}

export const DEFAULT_SPLAT_CLIP_MARGIN_METERS = 0.3;
export const SPLAT_CLIP_ROOM: SplatClipRoom = { width: 3, depth: 4, height: 2.4 };

export function createRoomClipBox(
  margin = DEFAULT_SPLAT_CLIP_MARGIN_METERS,
  room: SplatClipRoom = SPLAT_CLIP_ROOM
): SplatClipBox {
  const safeMargin = normalizeSplatClipMargin(margin);
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;

  return {
    min: {
      x: -halfWidth - safeMargin,
      y: -safeMargin,
      z: -halfDepth - safeMargin
    },
    max: {
      x: halfWidth + safeMargin,
      y: room.height + safeMargin,
      z: halfDepth + safeMargin
    },
    margin: safeMargin
  };
}

export function isInsideClipBox(point: SplatClipPoint, box: SplatClipBox): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

export function normalizeSplatClipMargin(margin: number): number {
  if (!Number.isFinite(margin) || margin < 0) {
    return DEFAULT_SPLAT_CLIP_MARGIN_METERS;
  }

  return margin;
}
