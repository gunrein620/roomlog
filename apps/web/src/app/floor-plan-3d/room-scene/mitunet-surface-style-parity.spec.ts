import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);

describe("MitUNet saved-view surface parity", () => {
  it("uses the MitUNet environment and four-light rig only for MitUNet plans", () => {
    assert.match(source, /RoomEnvironment/);
    assert.match(source, /ACESFilmicToneMapping/);
    assert.match(source, /hemisphereLight/);
    assert.match(source, /position=\{\[0, -6, 0\]\}/);
  });

  it("uses separate cap, side, and physical glass materials", () => {
    assert.match(source, /attach="material-0"/);
    assert.match(source, /attach="material-1"/);
    assert.match(source, /meshPhysicalMaterial/);
    assert.match(source, /transmission=\{0\.12\}/);
  });

  it("uses dynamic decorative floors without changing the interaction floor", () => {
    assert.match(source, /calculateMitunetGroundBounds/);
    assert.match(source, /MitunetDecorativeFloor/);
    assert.match(source, /raycast=\{\(\) => null\}/);
    assert.match(source, /RoomFloor/);
  });

  it("waits for the source-plan texture before falling back to the wood floor", () => {
    assert.match(
      source,
      /const sourceTexturePending = plan\.surfaceMode === "source" && loadedSourceTextureKey !== sourceTextureKey;/,
    );
    assert.match(
      source,
      /const activeFloorTexture = plan\.surfaceMode === "source"\s*\? sourceTexturePending \? null : sourceTexture \?\? woodTexture\s*:\ woodTexture;/,
    );
  });
});
