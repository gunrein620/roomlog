import assert from "node:assert/strict";
import test from "node:test";
import { solveSimilarity } from "./similarity-solve";
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
