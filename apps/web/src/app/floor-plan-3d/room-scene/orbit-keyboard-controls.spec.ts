import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);
const listingSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");

describe("furniture orbit keyboard controls", () => {
  it("moves the camera and orbit target by the same horizontal delta", () => {
    assert.match(viewerSource, /orbitKeyboardMovementDelta/);
    assert.match(viewerSource, /camera\.position\.x \+= delta\.x/);
    assert.match(viewerSource, /camera\.position\.z \+= delta\.z/);
    assert.match(viewerSource, /controls\.target\.x \+= delta\.x/);
    assert.match(viewerSource, /controls\.target\.z \+= delta\.z/);
    assert.match(viewerSource, /controls\.update\(\)/);
  });

  it("owns and cleans up keyboard and window-blur listeners", () => {
    for (const eventName of ["keydown", "keyup", "blur"]) {
      assert.match(viewerSource, new RegExp(`window\\.addEventListener\\("${eventName}"`));
      assert.match(viewerSource, new RegExp(`window\\.removeEventListener\\("${eventName}"`));
    }
    assert.match(viewerSource, /pressedKeysRef\.current\.clear\(\)/);
    assert.match(viewerSource, /isOrbitKeyboardInteractiveTarget\(event\.target\)/);
  });

  it("initializes the target without resetting translated orbit state on every render", () => {
    assert.match(viewerSource, /controls\.target\.set\(target\[0\], target\[1\], target\[2\]\)/);
    assert.doesNotMatch(viewerSource, /target=\{target\}/);
  });

  it("enables keyboard movement only for the fullscreen furniture mode", () => {
    assert.match(viewerSource, /orbitKeyboardMoveEnabled\?: boolean/);
    assert.match(viewerSource, /keyboardMoveEnabled=\{orbitKeyboardMoveEnabled\}/);
    assert.match(listingSource, /orbitKeyboardMoveEnabled=\{simulationOpen && simulationMode === "furniture"\}/);
    assert.match(viewerSource, /WASD 이동 · 드래그 회전/);
  });
});
