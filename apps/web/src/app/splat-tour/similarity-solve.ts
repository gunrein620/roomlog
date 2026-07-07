import type { Point2, RegistrationPointPair, SplatTransform } from "./tour-types";
import { projectSplatToPlan } from "./transform-project";

export interface SolveOptions {
  /** Passed through to the returned transform. Defaults to SPZ Y-down to Y-up gravity alignment. */
  rotationXDegrees?: number;
  /** Passed through to the returned transform. */
  offsetY?: number;
}

const DEFAULT_ROTATION_X_DEGREES = 180;
const DEFAULT_OFFSET_Y = 0;

/**
 * Solves the closed-form 2-point 2D similarity transform from splat floor coordinates to plan coordinates.
 *
 * Throws RangeError when either registration segment has zero length because scale/yaw are not uniquely defined.
 */
export function solveSimilarity(
  pairs: [RegistrationPointPair, RegistrationPointPair],
  options: SolveOptions = {}
): SplatTransform {
  const [first, second] = pairs;
  const splatDelta = subtract(second.splat, first.splat);
  const planDelta = subtract(second.plan, first.plan);
  const splatDistance = length(splatDelta);
  const planDistance = length(planDelta);

  if (splatDistance === 0 || planDistance === 0) {
    throw new RangeError("Cannot solve similarity transform from zero-length registration segments.");
  }

  const scaleMultiplier = planDistance / splatDistance;
  const rotationRadians = Math.atan2(planDelta.y, planDelta.x) - Math.atan2(splatDelta.y, splatDelta.x);
  const rotatedFirstSplat = rotate(first.splat, rotationRadians);
  const offsetX = first.plan.x - scaleMultiplier * rotatedFirstSplat.x;
  const offsetZ = first.plan.y - scaleMultiplier * rotatedFirstSplat.y;

  return {
    rotationXDegrees: options.rotationXDegrees ?? DEFAULT_ROTATION_X_DEGREES,
    rotationYDegrees: cleanNegativeZero(radiansToDegrees(rotationRadians)),
    scaleMultiplier: cleanNegativeZero(scaleMultiplier),
    offsetX: cleanNegativeZero(offsetX),
    offsetY: options.offsetY ?? DEFAULT_OFFSET_Y,
    offsetZ: cleanNegativeZero(offsetZ)
  };
}

export interface PickViewTuning {
  rotationXDegrees?: number;
  rotationYDegrees?: number;
  scaleMultiplier?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

/**
 * 픽 화면이 튜닝 프로파일로 배치한 splat 위에서 푼 정합 결과를, 원본 splat에 적용 가능한
 * 절대 transform으로 합성한다. solveSimilarity는 "픽 화면에 보인 splat → 도면"을 풀지만,
 * 씬 주입(tuningFromTransform)은 결과를 원본 메시에 적용하므로 프로파일 배치(rotX·스케일·
 * 오프셋)를 잃는다 — 예: 바로 선 SPZ(rotX 0)가 솔버 기본값 180으로 뒤집힘.
 * total = solved ∘ pick: rotX는 픽 화면 값, rotY는 합, 스케일은 곱, 오프셋은 solved로 투영.
 * 주의: bbox auto-fit 배치는 재현 불가 — 픽 화면은 native 프로파일을 전제한다.
 */
export function composeWithPickViewTuning(
  solved: SplatTransform,
  pick: PickViewTuning | null
): SplatTransform {
  if (!pick) return solved;

  const offsetXZ = projectSplatToPlan(solved, { x: pick.offsetX ?? 0, y: pick.offsetZ ?? 0 });

  return {
    rotationXDegrees: pick.rotationXDegrees ?? solved.rotationXDegrees,
    // pick.rotationYDegrees는 씬 튜닝(three.js R_y) 규약, solved는 2D 계약 규약이라
    // 부호가 반대다(R_y(−θ) ≡ R_2D(θ)) — 2D 계약 공간에서 합성하므로 빼서 더한다.
    rotationYDegrees: cleanNegativeZero(solved.rotationYDegrees - (pick.rotationYDegrees ?? 0)),
    scaleMultiplier: cleanNegativeZero(solved.scaleMultiplier * (pick.scaleMultiplier ?? 1)),
    offsetX: cleanNegativeZero(offsetXZ.x),
    offsetY: cleanNegativeZero(solved.offsetY + solved.scaleMultiplier * (pick.offsetY ?? 0)),
    offsetZ: cleanNegativeZero(offsetXZ.y)
  };
}

function subtract(to: Point2, from: Point2): Point2 {
  return {
    x: to.x - from.x,
    y: to.y - from.y
  };
}

function length(point: Point2): number {
  return Math.hypot(point.x, point.y);
}

function rotate(point: Point2, radians: number): Point2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: cos * point.x - sin * point.y,
    y: sin * point.x + cos * point.y
  };
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function cleanNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
