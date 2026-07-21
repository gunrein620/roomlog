import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

const sceneDir = join(process.cwd(), "src/app/floor-plan-3d/room-scene");
const controllerPath = join(sceneDir, "FurnitureFirstPersonControls.tsx");
const viewerSource = readFileSync(join(sceneDir, "RoomlogThreeFloorPlanView.tsx"), "utf8");
const listingSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const mitunetExtrudedLayerSource = viewerSource.slice(
  viewerSource.indexOf("function MitunetExtrudedLayer"),
  viewerSource.indexOf("// Heights mirror the MitUNet viewer")
);

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
    assert.match(controllerSource, /onLatestPlacementPoint/);
    assert.match(controllerSource, /onRotateLeft/);
    assert.match(controllerSource, /onRotateRight/);
    assert.match(controllerSource, /modeRef\.current === "carry"[\s\S]*?onCancel\(\)[\s\S]*?onOpenSelect\(\)/);
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
    assert.match(mitunetExtrudedLayerSource, /userData=\{\{ roomlogPlacementSurface: "wall" \}\}/);
    assert.match(viewerSource, /roomlogFurnitureId: furniture\.id/);
    assert.match(viewerSource, /className="floor-plan-furniture-reticle"/);
    assert.match(viewerSource, /1 왼쪽 회전 · 2 다시 선택 · 3 오른쪽 회전 · Q 고정/);
    assert.match(viewerSource, /2 가구 선택 · WASD 이동 · 마우스 시점/);
    assert.match(styles, /\.floor-plan-furniture-reticle/);
  });

  it("connects desktop E and Q actions to the existing placement mutations", () => {
    assert.match(listingSource, /useState<FurnitureInteractionMode>\("explore"\)/);
    assert.match(
      listingSource,
      /furnitureFirstPersonEnabled=\{simulationOpen && simulationMode === "furniture" && !isCoarsePointer\}/
    );
    assert.match(listingSource, /onFurniturePickupAimed=\{beginFurnitureMoveById\}/);
    assert.match(listingSource, /onFurniturePlacementPoint=\{placePendingFurniture\}/);
    assert.match(listingSource, /onFurnitureConfirm=\{confirmPendingFurnitureFromShortcut\}/);
    assert.match(listingSource, /lastFurniturePlacementPointRef/);
    assert.match(listingSource, /startCatalogFurnitureCarry/);
    assert.match(
      listingSource,
      /startCatalogFurnitureCarry[\s\S]*?document\.activeElement instanceof HTMLElement[\s\S]*?document\.activeElement\.blur\(\)/
    );
    assert.match(listingSource, /onFurnitureLatestPlacementPoint=\{rememberFurniturePlacementPoint\}/);
    assert.match(listingSource, /onFurnitureRotateLeft=\{\(\) => rotatePendingFurniture\(-1\)\}/);
    assert.match(listingSource, /onFurnitureRotateRight=\{\(\) => rotatePendingFurniture\(1\)\}/);
    assert.match(listingSource, /furniturePointerLockRequestRef\.current\?\.\(\)/);
  });
});
