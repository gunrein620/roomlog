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
    assert.match(controllerSource, /furnitureFlyMovementDelta/);
    // 자유시점(비행) — Y를 눈높이 상수로 고정하지 않고, 클램프 범위 안에서 시선 방향 그대로 이동한다.
    assert.match(controllerSource, /FURNITURE_MIN_EYE_HEIGHT_METERS/);
    assert.match(controllerSource, /FURNITURE_MAX_EYE_HEIGHT_METERS/);
    // 회전 키 분담 — 1/3은 90도 스냅(즉시), Q/E는 누르고 있는 동안 onRotateBy 연속 섬세 회전.
    assert.match(controllerSource, /fineRotateKeysRef/);
    assert.match(controllerSource, /fineRotateKeyDirection/);
    assert.match(controllerSource, /onRotateBy/);
    // 포인터록 중 좌클릭 = 잡기(탐색·조준 시)/배치 고정(운반) — E/Q 단축키와 병행.
    assert.match(
      controllerSource,
      /pointerLockElement === canvas[\s\S]*?"explore" && aimedFurnitureIdRef\.current[\s\S]*?onPickupAimed[\s\S]*?"carry"[\s\S]*?onConfirm\(\)/
    );
    assert.match(controllerSource, /raycaster\.setFromCamera\(CENTER_SCREEN/);
    assert.match(controllerSource, /onPlacementPoint/);
    assert.match(controllerSource, /onAimedFurnitureChange/);
    assert.match(controllerSource, /onLatestPlacementPoint/);
    assert.match(controllerSource, /onRotateLeft/);
    assert.match(controllerSource, /onRotateRight/);
    assert.match(controllerSource, /modeRef\.current === "carry"[\s\S]*?onCancel\(\)[\s\S]*?onOpenSelect\(\)/);
    assert.match(controllerSource, /onPlacementHit/);
    assert.match(controllerSource, /onLatestPlacementHit/);
    assert.match(controllerSource, /onRemove/);
    assert.match(controllerSource, /normal\.transformDirection\(.*matrixWorld/);
    assert.match(controllerSource, /supportTopY/);
    assert.match(controllerSource, /wallMaxY/);
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
    assert.match(mitunetExtrudedLayerSource, /userData=\{\{ roomlogPlacementSurface: "wall", roomlogWallId: "mitunet-wall" \}\}/);
    assert.match(viewerSource, /roomlogFurnitureId: furniture\.id/);
    assert.match(viewerSource, /className=\{`floor-plan-furniture-reticle is-/);
    assert.match(viewerSource, /1\/3 90도 회전 · Q\/E 섬세 회전 · 2 다시 선택 · 클릭 고정/);
    assert.match(viewerSource, /클릭\/E 가구 잡기/);
    assert.match(viewerSource, /2 가구 선택 · WASD 이동 · 마우스 시점/);
    assert.match(styles, /\.floor-plan-furniture-reticle/);
  });

  it("shows green or red placement feedback with the active surface label", () => {
    assert.match(viewerSource, /바닥 배치/);
    assert.match(viewerSource, /가구 위 배치/);
    assert.match(viewerSource, /벽걸이 배치/);
    assert.match(viewerSource, /배치 불가/);
    assert.match(viewerSource, /floor-plan-furniture-reticle is-/);
    assert.match(styles, /\.floor-plan-furniture-reticle\.is-valid/);
    assert.match(styles, /\.floor-plan-furniture-reticle\.is-invalid/);
    assert.match(styles, /var\(--success\)/);
    assert.match(styles, /var\(--error\)/);
  });

  it("rotates wall-mounted GLB furniture around its visual centre", () => {
    assert.match(viewerSource, /const wallMounted = furniture\.placement\?\.mode === "wall"/);
    assert.match(viewerSource, /wallMounted \? furniture\.position\[1\] \+ renderedHeight \/ 2/);
    assert.match(viewerSource, /wallMounted \? modelOffsetY - dimensions\.height \/ 2/);
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
    assert.match(listingSource, /onFurnitureRotateBy=\{rotatePendingFurnitureBy\}/);
    assert.match(listingSource, /furniturePointerLockRequestRef\.current\?\.\(\)/);
  });
});
