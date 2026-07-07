import assert from "node:assert/strict";
import test from "node:test";
import { composeWithPickViewTuning, solveSimilarity, type PickViewTuning } from "./similarity-solve";
import type { Point2, RegistrationPointPair, SplatTransform } from "./tour-types";

const EPSILON = 1e-9;

test("round-trips a composed scale, yaw, and translation transform", () => {
  const scale = 1.73;
  const rotationYDegrees = -37;
  const translation = { x: 4.2, y: -2.6 };
  const splatA = { x: -1.25, y: 0.75 };
  const splatB = { x: 2.5, y: -0.4 };
  const pairs: [RegistrationPointPair, RegistrationPointPair] = [
    { splat: splatA, plan: applySimilarity(splatA, scale, rotationYDegrees, translation) },
    { splat: splatB, plan: applySimilarity(splatB, scale, rotationYDegrees, translation) }
  ];

  const transform = solveSimilarity(pairs);

  assertTransformApproxEqual(transform, {
    rotationXDegrees: 180,
    rotationYDegrees,
    scaleMultiplier: scale,
    offsetX: translation.x,
    offsetY: 0,
    offsetZ: translation.y
  });
});

test("returns the identity transform for matching splat and plan pairs", () => {
  const transform = solveSimilarity([
    { splat: { x: 0, y: 0 }, plan: { x: 0, y: 0 } },
    { splat: { x: 2, y: 3 }, plan: { x: 2, y: 3 } }
  ]);

  assertTransformApproxEqual(transform, {
    rotationXDegrees: 180,
    rotationYDegrees: 0,
    scaleMultiplier: 1,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0
  });
});

test("solves a pure 2x scale without yaw", () => {
  const transform = solveSimilarity([
    { splat: { x: 0, y: 0 }, plan: { x: 0, y: 0 } },
    { splat: { x: 1.25, y: -2 }, plan: { x: 2.5, y: -4 } }
  ]);

  assertApproxEqual(transform.scaleMultiplier, 2);
  assertApproxEqual(transform.rotationYDegrees, 0);
  assertApproxEqual(transform.offsetX, 0);
  assertApproxEqual(transform.offsetZ, 0);
});

test("uses positive yaw for a 90 degree counterclockwise plan rotation", () => {
  const transform = solveSimilarity([
    { splat: { x: 0, y: 0 }, plan: { x: 0, y: 0 } },
    { splat: { x: 1, y: 0 }, plan: { x: 0, y: 1 } }
  ]);

  assertApproxEqual(transform.rotationYDegrees, 90);
  assertApproxEqual(transform.scaleMultiplier, 1);
  assertApproxEqual(transform.offsetX, 0);
  assertApproxEqual(transform.offsetZ, 0);
});

test("throws for a zero-length registration segment", () => {
  assert.throws(
    () =>
      solveSimilarity([
        { splat: { x: 1, y: 1 }, plan: { x: 0, y: 0 } },
        { splat: { x: 1, y: 1 }, plan: { x: 2, y: 0 } }
      ]),
    RangeError
  );
});

test("passes through rotationXDegrees and offsetY options", () => {
  const transform = solveSimilarity(
    [
      { splat: { x: 0, y: 0 }, plan: { x: 0, y: 0 } },
      { splat: { x: 1, y: 0 }, plan: { x: 1, y: 0 } }
    ],
    { rotationXDegrees: 180, offsetY: 1.2 }
  );

  assert.equal(transform.rotationXDegrees, 180);
  assert.equal(transform.offsetY, 1.2);
});

test("composeWithPickViewTuning returns the solved transform unchanged without a pick profile", () => {
  const solved: SplatTransform = {
    rotationXDegrees: 180,
    rotationYDegrees: 12,
    scaleMultiplier: 1.4,
    offsetX: 0.2,
    offsetY: 0,
    offsetZ: -0.9
  };

  assert.deepEqual(composeWithPickViewTuning(solved, null), solved);
});

test("composeWithPickViewTuning keeps an upright SPZ profile upright and scales its floor offset", () => {
  const solved: SplatTransform = {
    rotationXDegrees: 180, // 솔버 기본값(ply 규약) — 픽 화면이 rotX 0이면 덮어써야 한다.
    rotationYDegrees: 8.5,
    scaleMultiplier: 1.57,
    offsetX: -0.08,
    offsetY: 0,
    offsetZ: 0.51
  };
  const pick: PickViewTuning = { rotationXDegrees: 0, offsetY: 1.3 };

  const total = composeWithPickViewTuning(solved, pick);

  assertTransformApproxEqual(total, {
    rotationXDegrees: 0,
    rotationYDegrees: 8.5,
    scaleMultiplier: 1.57,
    offsetX: -0.08,
    offsetY: 1.57 * 1.3,
    offsetZ: 0.51
  });
});

test("composeWithPickViewTuning maps raw splat points to the same plan points as solved ∘ pick placement", () => {
  const pick: PickViewTuning = {
    rotationXDegrees: 0,
    rotationYDegrees: 30,
    scaleMultiplier: 2,
    offsetX: 0.3,
    offsetY: 1.3,
    offsetZ: -0.7
  };
  const solved: SplatTransform = {
    rotationXDegrees: 180,
    rotationYDegrees: -45,
    scaleMultiplier: 1.5,
    offsetX: 4,
    offsetY: 0,
    offsetZ: -2
  };
  const raw: Point2 = { x: 1, y: -0.5 };

  // pick.rotationYDegrees는 three.js R_y 규약 — XZ 평면(2D)에서는 −θ 회전과 같다.
  const placed = applySimilarity(raw, pick.scaleMultiplier ?? 1, -(pick.rotationYDegrees ?? 0), {
    x: pick.offsetX ?? 0,
    y: pick.offsetZ ?? 0
  });
  const expected = applySimilarity(placed, solved.scaleMultiplier, solved.rotationYDegrees, {
    x: solved.offsetX,
    y: solved.offsetZ
  });

  const total = composeWithPickViewTuning(solved, pick);
  const actual = applySimilarity(raw, total.scaleMultiplier, total.rotationYDegrees, {
    x: total.offsetX,
    y: total.offsetZ
  });

  assertApproxEqual(actual.x, expected.x);
  assertApproxEqual(actual.y, expected.y);
  assertApproxEqual(total.offsetY, 1.5 * 1.3);
});

function applySimilarity(point: Point2, scale: number, rotationYDegrees: number, translation: Point2): Point2 {
  const radians = degreesToRadians(rotationYDegrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: scale * (cos * point.x - sin * point.y) + translation.x,
    y: scale * (sin * point.x + cos * point.y) + translation.y
  };
}

function assertTransformApproxEqual(actual: SplatTransform, expected: SplatTransform) {
  assertApproxEqual(actual.rotationXDegrees, expected.rotationXDegrees);
  assertApproxEqual(actual.rotationYDegrees, expected.rotationYDegrees);
  assertApproxEqual(actual.scaleMultiplier, expected.scaleMultiplier);
  assertApproxEqual(actual.offsetX, expected.offsetX);
  assertApproxEqual(actual.offsetY, expected.offsetY);
  assertApproxEqual(actual.offsetZ, expected.offsetZ);
}

function assertApproxEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} is not within ${EPSILON} of ${expected}`);
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
