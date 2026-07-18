import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_CAMERA_VIEWS,
  cameraPresetPosition,
} from "../viewer/camera-view-presets.mjs";

const center = { x: 4, y: 1, z: -3 };
const roundPoint = point => Object.fromEntries(
  Object.entries(point).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6]),
);

test("publishes the five fixed camera views in UI order", () => {
  assert.deepEqual(FIXED_CAMERA_VIEWS, ["perspective", "top", "front", "left", "right"]);
});

test("places each fixed view on the requested framing sphere", () => {
  const positions = Object.fromEntries(FIXED_CAMERA_VIEWS.map(view => [
    view,
    cameraPresetPosition(view, center, 10),
  ]));

  for (const position of Object.values(positions)) {
    assert.equal(
      Math.round(Math.hypot(
        position.x - center.x,
        position.y - center.y,
        position.z - center.z,
      ) * 1e6) / 1e6,
      10,
    );
  }
  assert.ok(positions.top.y > center.y);
  assert.ok(positions.front.z > center.z);
  assert.ok(positions.left.x < center.x);
  assert.ok(positions.right.x > center.x);
  assert.notDeepEqual(roundPoint(positions.perspective), roundPoint(positions.front));
});

test("rejects unknown views and non-positive distances", () => {
  assert.throws(() => cameraPresetPosition("rear", center, 10), /Unknown camera view/);
  assert.throws(() => cameraPresetPosition("top", center, 0), /positive/);
});
