import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUR_CAMERA_DOLLY_RANGE_METERS,
  TOUR_CAMERA_HORIZON_EPSILON_RADIANS,
  calculateTourCameraDistance,
  calculateTourCameraRigLimits,
  clampTourCameraPositionToClipBox
} from "./tour-camera-math";
import { createRoomClipBox } from "./splat-clip";

const EPSILON = 1e-9;

test("calculates preset distance from position to target", () => {
  assertApproxEqual(calculateTourCameraDistance([0.6, 1.5, 1.5], [0, 1.4, -0.5]), Math.sqrt(4.37));
});

test("clamps dolly range to the preset distance plus or minus half a meter", () => {
  const distance = Math.sqrt(0.6625);
  const limits = calculateTourCameraRigLimits([0, 1.5, -1.2], [0, 1.35, -2]);

  assertApproxEqual(limits.distance, distance);
  assertApproxEqual(limits.minDistance, distance - TOUR_CAMERA_DOLLY_RANGE_METERS);
  assertApproxEqual(limits.maxDistance, distance + TOUR_CAMERA_DOLLY_RANGE_METERS);
});

test("floors very short preset distances to a safe camera distance", () => {
  const limits = calculateTourCameraRigLimits([0, 0.05, 0], [0, 0, 0]);

  assert.equal(limits.minDistance, 0.1);
  assert.equal(limits.maxDistance, 0.55);
});

test("caps polar orbit before the camera flips below the horizon", () => {
  const limits = calculateTourCameraRigLimits([0, 1.5, 0.2], [0, 1.4, -2]);

  assert.ok(limits.minPolarAngle < limits.maxPolarAngle);
  assert.equal(limits.maxPolarAngle, Math.PI / 2 - TOUR_CAMERA_HORIZON_EPSILON_RADIANS);
});

test("clamps walking camera position to the room clip box", () => {
  const box = createRoomClipBox(0.3, { width: 3, depth: 4, height: 2.4 });
  const position = clampTourCameraPositionToClipBox([2.4, 3.1, -2.8], box);

  assertVectorApproxEqual(position, [1.8, 2.7, -2.3]);
});

test("leaves walking camera position unchanged inside the room clip box", () => {
  const box = createRoomClipBox(0.3, { width: 3, depth: 4, height: 2.4 });
  const position = clampTourCameraPositionToClipBox([0.25, 1.45, -0.75], box);

  assert.deepEqual(position, [0.25, 1.45, -0.75]);
});

function assertApproxEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} is not within ${EPSILON} of ${expected}`);
}

function assertVectorApproxEqual(actual: [number, number, number], expected: [number, number, number]) {
  actual.forEach((value, index) => assertApproxEqual(value, expected[index]));
}
