// The MitUNet viewer and this app render the same plan twice, from separate code.
// When they disagree a plan silently changes shape on the way back into the
// listing form, so pin the rules that have to stay identical.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);

describe("MitUNet renderer parity with the viewer", () => {
  it("keeps door openings fully open with no header wall", () => {
    const doorLayers = source.match(/polygons=\{layout\.door\}/g) ?? [];
    assert.equal(doorLayers.length, 0);
  });

  it("branches on calibration for wall and window heights", () => {
    assert.match(source, /hasPhysicalScale \? PHYSICAL_WALL_HEIGHT : WALL_HEIGHT/);
    assert.match(source, /hasPhysicalScale \? PHYSICAL_WINDOW_SILL : WINDOW_SILL/);
    assert.match(source, /hasPhysicalScale \? PHYSICAL_WINDOW_TOP : WINDOW_TOP/);
  });

  it("keeps the viewer's height constants", () => {
    for (const [name, value] of [
      ["WALL_HEIGHT", "0.55"],
      ["WINDOW_SILL", "0.16"],
      ["WINDOW_TOP", "0.45"],
      ["PHYSICAL_WALL_HEIGHT", "2.7"],
      ["PHYSICAL_WINDOW_SILL", "0.9"],
      ["PHYSICAL_WINDOW_TOP", "2.1"]
    ]) {
      assert.match(source, new RegExp(`const ${name} = ${value.replace(".", "\\.")};`));
    }
  });

  it("restores wall below the sill and above the lintel around glass", () => {
    const windowLayers = source.match(/polygons=\{layout\.window\}/g) ?? [];
    assert.equal(windowLayers.length, 3);
  });
});
