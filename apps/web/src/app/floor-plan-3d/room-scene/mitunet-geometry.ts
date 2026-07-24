import type { MitunetFloorPlan, MitunetPolygon } from "@/lib/mitunet-floor-plan";
// 값 import는 상대경로로 — "@/" 별칭은 타입만 지워지는 import type이면 무해하지만, 런타임에 실제로
// require되는 값 import로 쓰면 ts-node 유닛테스트 러너(tsconfig-paths 미등록)가 모듈을 못 찾는다
// (2026-07-2x 실측 회귀 — mitunetSceneLayoutFromPayload 추가하며 걸림).
import { normalizeMitunetPayload } from "../../../lib/mitunet-floor-plan";

export type MitunetScenePolygon = {
  outer: [number, number][];
  holes: [number, number][][];
};

export type MitunetSceneLayout = {
  bounds: { centerX: number; centerZ: number; width: number; depth: number };
  /** False when the plan has no real-world scale, so the model is a scaled-down stand-in. */
  hasPhysicalScale: boolean;
  wall: MitunetScenePolygon[];
  door: MitunetScenePolygon[];
  window: MitunetScenePolygon[];
  /** RoomPlan 캡처 경로(capture-to-layout.ts)에서만 채워지는 바닥 폴리곤. mitunet 경로는
   * 원본 도면 이미지 픽셀 기반의 자체 바닥(MitunetDecorativeFloor)이 있어 이 필드를 안 채운다 —
   * createMitunetSceneLayout은 undefined로 둔다. */
  floor?: MitunetScenePolygon[];
};

// Mirrors TARGET_PLAN_SIZE in the MitUNet viewer (viewer/index.html); both
// renderers must frame an uncalibrated plan identically.
const UNCALIBRATED_LONG_SIDE_METERS = 8;
// Mirrors furnitureSceneScale in the MitUNet viewer. Without physical
// calibration, the whole plan is represented as an eight-metre stand-in.
const UNCALIBRATED_FURNITURE_SCENE_SCALE = 0.55 / 2.7;

export function resolveMitunetFurnitureSceneScale(plan: MitunetFloorPlan) {
  const millimetersPerPixel = Number(plan.millimetersPerPixel);

  return Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0
    ? 1
    : UNCALIBRATED_FURNITURE_SCENE_SCALE;
}

export function createMitunetSceneLayout(plan: MitunetFloorPlan): MitunetSceneLayout {
  const outerPoints = [plan.polygons.wall, plan.polygons.door, plan.polygons.window]
    .flatMap((polygons) => polygons)
    .flatMap((polygon) => polygon.outer)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (outerPoints.length === 0) {
    throw new Error("MitUNet plan has no polygon vertices");
  }

  const pixelXs = outerPoints.map(([x]) => x);
  const pixelYs = outerPoints.map(([, y]) => y);
  const minPixelX = Math.min(...pixelXs);
  const maxPixelX = Math.max(...pixelXs);
  const minPixelY = Math.min(...pixelYs);
  const maxPixelY = Math.max(...pixelYs);
  const polygonWidth = maxPixelX - minPixelX;
  const polygonDepth = maxPixelY - minPixelY;
  const polygonLongSide = Math.max(polygonWidth, polygonDepth);
  if (!(polygonLongSide > 0)) {
    throw new Error("MitUNet polygon bounds must have a positive size");
  }

  const hasPhysicalScale =
    typeof plan.millimetersPerPixel === "number"
    && Number.isFinite(plan.millimetersPerPixel)
    && plan.millimetersPerPixel > 0;
  const metresPerPixel = hasPhysicalScale
    ? plan.millimetersPerPixel! / 1_000
    : UNCALIBRATED_LONG_SIDE_METERS / polygonLongSide;
  const centerPixelX = (minPixelX + maxPixelX) / 2;
  const centerPixelY = (minPixelY + maxPixelY) / 2;

  const point = ([x, y]: [number, number]): [number, number] => [
    (x - centerPixelX) * metresPerPixel,
    (y - centerPixelY) * metresPerPixel
  ];
  const polygon = (source: MitunetPolygon): MitunetScenePolygon => ({
    outer: source.outer.map(point),
    holes: source.holes.map((hole) => hole.map(point))
  });

  return {
    bounds: {
      centerX: 0,
      centerZ: 0,
      width: polygonWidth * metresPerPixel,
      depth: polygonDepth * metresPerPixel
    },
    hasPhysicalScale,
    wall: plan.polygons.wall.map(polygon),
    door: plan.polygons.door.map(polygon),
    window: plan.polygons.window.map(polygon)
  };
}

/**
 * mitunet 도면(미검증 JSON, 예: 매물 floorPlan.mitunet 스냅샷) → MitunetSceneLayout.
 * 파싱 실패하거나(스키마·버전 불일치) 폴리곤 정점이 없으면 null — 호출측이 "이 도면은 못 쓴다"로
 * 처리할 수 있게(dev/floor-plan-fixtures 페이지의 loadFixture와 같은 패턴).
 */
export function mitunetSceneLayoutFromPayload(payload: unknown): MitunetSceneLayout | null {
  const plan = normalizeMitunetPayload(payload);
  if (!plan) return null;
  try {
    return createMitunetSceneLayout(plan);
  } catch {
    return null;
  }
}

export function resolveTourSceneScale(
  mitunetPlan: MitunetFloorPlan | undefined,
  legacyScale: number
) {
  return mitunetPlan ? 1 : legacyScale;
}

export function normalizeTourScenePoint(
  point: { x: number; z: number },
  sceneScale: number
) {
  const divisor = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
  return {
    x: point.x / divisor,
    z: point.z / divisor
  };
}
