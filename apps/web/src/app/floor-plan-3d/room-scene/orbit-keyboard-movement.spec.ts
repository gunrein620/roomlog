import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORBIT_MAX_FRAME_DELTA_SECONDS,
  ORBIT_MOVE_SPEED_METERS_PER_SECOND,
  isOrbitKeyboardInteractiveTarget,
  orbitKeyboardMovementDelta
} from "./orbit-keyboard-movement";

describe("orbit keyboard movement", () => {
  it("caps long frames and moves relative to the horizontal camera heading", () => {
    const delta = orbitKeyboardMovementDelta(new Set(["forward"]), { x: 0, z: -1 }, 0.5);

    assert.deepEqual(delta, {
      x: 0,
      z: -ORBIT_MOVE_SPEED_METERS_PER_SECOND * ORBIT_MAX_FRAME_DELTA_SECONDS
    });
  });

  it("normalizes diagonal movement", () => {
    const delta = orbitKeyboardMovementDelta(new Set(["forward", "right"]), { x: 0, z: -1 }, 0.1);

    assert.ok(Math.abs(Math.hypot(delta.x, delta.z) - ORBIT_MOVE_SPEED_METERS_PER_SECOND * 0.1) < 1e-9);
    assert.ok(delta.x > 0);
    assert.ok(delta.z < 0);
  });

  it("cancels opposing keys", () => {
    assert.deepEqual(
      orbitKeyboardMovementDelta(new Set(["forward", "backward", "left", "right"]), { x: 0, z: -1 }, 0.1),
      { x: 0, z: 0 }
    );
  });

  it("ignores interactive and content-editable keyboard targets", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
      assert.equal(isOrbitKeyboardInteractiveTarget({ tagName }), true);
    }
    assert.equal(isOrbitKeyboardInteractiveTarget({ isContentEditable: true }), true);
    assert.equal(isOrbitKeyboardInteractiveTarget({ closest: () => ({}) }), true);
    assert.equal(isOrbitKeyboardInteractiveTarget({ tagName: "CANVAS", closest: () => null }), false);
    assert.equal(isOrbitKeyboardInteractiveTarget(null), false);
  });
});
