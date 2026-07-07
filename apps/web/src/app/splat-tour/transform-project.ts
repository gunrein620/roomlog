import type { Point2, SplatTransform } from "./tour-types";

// 정합-해금 하이브리드 기능의 공통 기반: splat 바닥평면 좌표 ↔ 도면 좌표 사이의
// forward/inverse 유사변환. solveSimilarity(similarity-solve.ts)와 동일 규약을 따른다:
//   plan = scale · R(θ) · splat + t     (θ=rotationYDegrees, t=(offsetX, offsetZ))
// 미니맵 위치점(카메라 splat좌표 → 도면 점), 자동 프리셋(도면 점 → splat 카메라 타깃)
// 등이 전부 이 두 함수 위에서 동작한다. 문서: docs/remote-3d-tour.md §4.

function rotate(point: Point2, radians: number): Point2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: cos * point.x - sin * point.y,
    y: sin * point.x + cos * point.y
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** splat 바닥평면 좌표(예: 카메라 x,z) → 도면 좌표. */
export function projectSplatToPlan(transform: SplatTransform, splat: Point2): Point2 {
  const rotated = rotate(splat, toRadians(transform.rotationYDegrees));
  return {
    x: transform.scaleMultiplier * rotated.x + transform.offsetX,
    y: transform.scaleMultiplier * rotated.y + transform.offsetZ
  };
}

/** 도면 좌표 → splat 바닥평면 좌표 (projectSplatToPlan의 역변환). */
export function projectPlanToSplat(transform: SplatTransform, plan: Point2): Point2 {
  if (transform.scaleMultiplier === 0) {
    throw new RangeError("scaleMultiplier가 0이면 역변환이 정의되지 않습니다.");
  }
  const translated = { x: plan.x - transform.offsetX, y: plan.y - transform.offsetZ };
  const unscaled = { x: translated.x / transform.scaleMultiplier, y: translated.y / transform.scaleMultiplier };
  return rotate(unscaled, -toRadians(transform.rotationYDegrees));
}
