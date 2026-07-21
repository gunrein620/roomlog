import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

const sceneDir = join(process.cwd(), "src/app/floor-plan-3d/room-scene");
const controllerPath = join(sceneDir, "FurnitureFirstPersonControls.tsx");
const viewerSource = readFileSync(join(sceneDir, "RoomlogThreeFloorPlanView.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("furniture first-person controls", () => {
  it("owns pointer lock, mouse look, keyboard movement, and center raycasting", () => {
    const controllerSource = readFileSync(controllerPath, "utf8");

    assert.match(controllerSource, /document\.addEventListener\("pointerlockchange"/);
    assert.match(controllerSource, /document\.addEventListener\("mousemove"/);
    assert.match(controllerSource, /resolveFurnitureShortcut/);
    assert.match(controllerSource, /furnitureFirstPersonMovementDelta/);
    assert.match(controllerSource, /raycaster\.setFromCamera\(CENTER_SCREEN/);
    assert.match(controllerSource, /onPlacementPoint/);
    assert.match(controllerSource, /onAimedFurnitureChange/);
  });

  it("mounts the dedicated controller while retaining orbit fallback", () => {
    assert.match(viewerSource, /furnitureFirstPersonEnabled\?: boolean/);
    assert.match(viewerSource, /<FurnitureFirstPersonControls/);
    assert.match(viewerSource, /furnitureFirstPersonEnabled[\s\S]*?<FurnitureFirstPersonControls[\s\S]*?:\s*\([\s\S]*?<RoomOrbitControls/);
    assert.match(viewerSource, /controlMode === "orbit" && !furnitureFirstPersonEnabled/);
  });

  it("marks aimable scene objects and shows state-specific guidance", () => {
    assert.match(viewerSource, /roomlogPlacementSurface: "floor"/);
    assert.match(viewerSource, /roomlogPlacementSurface: "wall"/);
    assert.match(viewerSource, /roomlogFurnitureId: furniture\.id/);
    assert.match(viewerSource, /className="floor-plan-furniture-reticle"/);
    assert.match(viewerSource, /Q 고정 · Esc 취소/);
    assert.match(viewerSource, /WASD 이동 · 마우스 시점 · E 가구 선택/);
    assert.match(styles, /\.floor-plan-furniture-reticle/);
  });
});
