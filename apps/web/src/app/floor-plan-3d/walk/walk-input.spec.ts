import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cameraRelativeWalkDelta, combineWalkInput, resolveWalkInputCode } from "./walk-input";

describe("walk input", () => {
  it("maps WASD and arrows to the same actions", () => {
    assert.equal(resolveWalkInputCode("KeyW"), "forward");
    assert.equal(resolveWalkInputCode("ArrowUp"), "forward");
    assert.equal(resolveWalkInputCode("KeyA"), "left");
    assert.equal(resolveWalkInputCode("ArrowRight"), "right");
    assert.equal(resolveWalkInputCode("Space"), null);
  });

  it("combines digital and analogue movement", () => {
    assert.deepEqual(combineWalkInput(new Set(["forward", "left"]), { forward: 0.25, strafe: 0.5 }), {
      forward: 1.25,
      strafe: -0.5
    });
  });

  it("normalizes diagonal movement and keeps it camera-relative", () => {
    const delta = cameraRelativeWalkDelta({ forward: 1, strafe: 1 }, { x: 0, z: -1 }, 2);

    assert.ok(Math.abs(Math.hypot(delta.x, delta.z) - 2) < 1e-9);
    assert.ok(delta.x > 0);
    assert.ok(delta.z < 0);
  });
});
