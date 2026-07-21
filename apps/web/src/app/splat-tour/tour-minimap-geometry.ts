// TourMinimap의 순수 좌표 계산. 월드(splat 배치) XZ → 미니맵 SVG viewBox(0~100) 정규화 좌표.
// tour-viewer.tsx/splat-plan-shape.ts는 남의 소유라 import하지 않고, 벽 발자국 회전식은
// splat-plan-shape.ts의 wallLocalToWorldXZ와 동일한 식을 여기 옮겨 쓴다.
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import type { PlanBounds } from "./splat-plan-shape";

// viewBox 100x100 안에서 벽 발자국이 차지하는 가장자리 여백(%). 짧은 변은 이 여백 안쪽에서
// 가운데 정렬되고, 긴 변은 여백을 제외한 나머지(88%)를 꽉 채운다.
const EDGE_MARGIN_PERCENT = 6;
const USABLE_PERCENT = 100 - EDGE_MARGIN_PERCENT * 2;

function clamp0to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * bounds(미터)를 100x100 viewBox에 맞추는 균일 스케일과 중앙정렬 오프셋.
 * 긴 변이 usable(88%)을 꽉 채우도록 min(가로 스케일, 세로 스케일)을 쓰므로 실제 비율이
 * 보존된다(splat-plan-shape.ts registerPage의 Math.min(availW/width, availH/depth)와 같은 발상).
 * width·depth가 0 이하면(벽 발자국이 없거나 퇴화) null.
 */
export function computeMinimapFit(
  bounds: Pick<PlanBounds, "width" | "depth">
): { scale: number; offsetX: number; offsetY: number } | null {
  if (!(bounds.width > 0) || !(bounds.depth > 0)) return null;

  const scale = USABLE_PERCENT / Math.max(bounds.width, bounds.depth);
  return {
    scale,
    offsetX: (USABLE_PERCENT - bounds.width * scale) / 2,
    offsetY: (USABLE_PERCENT - bounds.depth * scale) / 2
  };
}

/**
 * 월드(x, z) → 미니맵 정규화 좌표(0~100, 방 비율 유지 + 6% 가장자리 여백 + 짧은 변 중앙정렬).
 * bounds가 퇴화(width/depth 0)면 viewBox 중앙(50, 50)으로 접는다.
 *
 * 주의: tour-viewer.tsx의 livePosition(카메라 점)은 지금 여백·비율 보존 없이
 * `((x - minX) / width) * 100`로 독립 축 스트레치한다 — 정사각형이 아닌 방에서는 이 함수와
 * 어긋난다. 점을 벽 안에 맞추려면 부모도 아래와 동일한 식을 써야 한다.
 */
export function normalizeWorldToMinimap(
  x: number,
  z: number,
  bounds: Pick<PlanBounds, "minX" | "minZ" | "width" | "depth">
): { x: number; y: number } {
  const fit = computeMinimapFit(bounds);
  if (!fit) return { x: 50, y: 50 };

  return {
    x: clamp0to100(EDGE_MARGIN_PERCENT + fit.offsetX + (x - bounds.minX) * fit.scale),
    y: clamp0to100(EDGE_MARGIN_PERCENT + fit.offsetY + (z - bounds.minZ) * fit.scale)
  };
}

/** 벽 하나의 바닥 발자국 4모서리(월드 XZ) — splat-plan-shape.ts의 wallLocalToWorldXZ와 동일 식. */
function wallFootprintCornersXZ(wall: WheretoputWall3D): { x: number; z: number }[] {
  const halfWidth = wall.dimensions.width / 2;
  const halfDepth = wall.dimensions.depth / 2;
  const ry = wall.rotation[1];
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const localCorners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];

  return localCorners.map((corner) => ({
    x: wall.position[0] + corner.x * cos + corner.z * sin,
    z: wall.position[2] - corner.x * sin + corner.z * cos
  }));
}

function isRenderableWall(wall: WheretoputWall3D): boolean {
  return (
    Number.isFinite(wall.dimensions?.width) &&
    wall.dimensions.width > 0 &&
    Number.isFinite(wall.dimensions?.depth) &&
    wall.dimensions.depth > 0 &&
    Array.isArray(wall.position) &&
    wall.position.every(Number.isFinite) &&
    Array.isArray(wall.rotation) &&
    wall.rotation.every(Number.isFinite)
  );
}

export type MinimapWallFootprint = { id: string; points: string };

/** 벽 배열 → SVG <polygon points="..."> 문자열 목록(정규화 좌표, bounds 비율 유지). */
export function wallsToMinimapFootprints(
  walls: readonly WheretoputWall3D[],
  bounds: PlanBounds
): MinimapWallFootprint[] {
  return walls.filter(isRenderableWall).map((wall) => ({
    id: String(wall.id),
    points: wallFootprintCornersXZ(wall)
      .map((corner) => {
        const point = normalizeWorldToMinimap(corner.x, corner.z, bounds);
        return `${point.x},${point.y}`;
      })
      .join(" ")
  }));
}

/** 미니맵 제목 옆 치수 라벨. 예: "3.2m x 4.1m". */
export function formatMinimapDimensions(bounds: Pick<PlanBounds, "width" | "depth">): string {
  return `${bounds.width.toFixed(1)}m x ${bounds.depth.toFixed(1)}m`;
}
