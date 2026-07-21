import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/room-scene/FloorPlanWalkControls.tsx"), "utf8");

describe("floor plan walk controls", () => {
  it("requests pointer lock only from a canvas click and observes lock lifecycle", () => {
    assert.match(source, /gl\.domElement\.addEventListener\("click"/);
    assert.match(source, /gl\.domElement\.requestPointerLock\(\)/);
    assert.match(source, /document\.addEventListener\("pointerlockchange"/);
    assert.match(source, /document\.addEventListener\("pointerlockerror"/);
    assert.match(source, /document\.addEventListener\("mousemove"/);
  });

  it("releases pointer lock and every global listener during cleanup", () => {
    assert.match(source, /document\.exitPointerLock\(\)/);
    for (const eventName of ["pointerlockchange", "pointerlockerror", "mousemove", "keydown", "keyup"]) {
      assert.match(source, new RegExp(`removeEventListener\\("${eventName}"`));
    }
  });

  it("uses the approved eye height, collision world, and frame-rate-independent movement", () => {
    assert.match(source, /const WALK_EYE_HEIGHT_METERS = 1\.45/);
    assert.match(source, /createFloorPlanWalkWorld/);
    assert.match(source, /resolveWalkMovement/);
    assert.match(source, /WALK_SPEED_METERS_PER_SECOND \* Math\.min\(delta, 0\.1\)/);
  });

  it("starts with a slightly downward view so a compact room does not look like a blank wall", () => {
    assert.match(source, /const WALK_INITIAL_LOOK_DROP_METERS = 0\.28/);
    assert.match(source, /WALK_EYE_HEIGHT_METERS - WALK_INITIAL_LOOK_DROP_METERS/);
  });

  it("ignores movement keys from editable controls", () => {
    assert.match(source, /tagName === "input" \|\| tagName === "textarea" \|\| target\.isContentEditable/);
  });
});
