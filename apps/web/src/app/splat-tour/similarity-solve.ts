import type { Point2, RegistrationPointPair, SplatTransform } from "./tour-types";

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
