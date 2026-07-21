import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);

test("bridges the cached floor-plan token before requesting GPT room materials", () => {
  const bridgeOffset = viewerSource.indexOf("async function ensureRoomLogSession()");
  const floorMaterialOffset = viewerSource.indexOf("async function ensureRoomFloorMaterials()");

  assert.ok(bridgeOffset >= 0, "RoomLog session bridge must exist in the viewer");
  assert.ok(floorMaterialOffset >= 0, "floor-material generation must remain available");
  assert.ok(bridgeOffset < floorMaterialOffset, "session bridge must be declared before floor-material generation");
  assert.match(viewerSource, /window\.location\.pathname\.startsWith\("\/floor-plan-3d\/"\)/);
  assert.match(viewerSource, /window\.localStorage\.getItem\("floorPlanAccessToken"\)/);
  assert.match(viewerSource, /fetch\("\/api\/auth\/floor-plan-session"/);
  assert.match(viewerSource, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(viewerSource, /credentials:\s*"same-origin"/);

  const ensureBody = viewerSource.slice(floorMaterialOffset, viewerSource.indexOf("function pointIsInsideFinishedFloor", floorMaterialOffset));
  assert.match(ensureBody, /await ensureRoomLogSession\(\);/);
  assert.ok(
    ensureBody.indexOf("await ensureRoomLogSession();") < ensureBody.indexOf('fetch("/room-materials"'),
    "session bridge must run before the room-material request",
  );
});

test("RoomLog furnishing uses the shared owner simulation while standalone keeps legacy furnishing", () => {
  assert.match(viewerSource, /beginRoomLogFurnitureSimulation/);
  assert.match(viewerSource, /if \(roomLogFlowRequested && roomLogContext\)/);
  assert.match(viewerSource, /currentFurniturePlacements\(\)/);
  assert.match(viewerSource, /furniturePanelOpenButton\.addEventListener\("click", \(\) => \{[\s\S]*?roomLogFlowRequested[\s\S]*?enterFurnishingStage/);
  assert.match(viewerSource, /if \(!furnitureCatalog\.length \|\| !furnitureCatalogPromise\)/);
});

test("RoomLog furnishing captures and restores a request-scoped editor snapshot", () => {
  assert.match(viewerSource, /readRoomLogFurnitureDraft/);
  assert.match(viewerSource, /async function buildRoomLogEditorSnapshot\(\)/);
  assert.match(viewerSource, /await reviewEditor\.toWallMaskBlob\(\)/);
  assert.match(viewerSource, /reviewEditor\.getOpenings\(\)/);
  assert.match(viewerSource, /reviewEditor\.getCalibration\(\)/);
  assert.match(viewerSource, /async function restoreRoomLogEditorSnapshot\(\)/);
  assert.match(viewerSource, /readRoomLogFurnitureDraft\(window\.localStorage, roomLogContext\.requestId\)/);
  assert.match(viewerSource, /await reviewEditor\.load\(snapshot\.review\)/);
  assert.match(viewerSource, /await loadPlan\(composedPlan\)/);
  assert.match(viewerSource, /await restoreRoomLogEditorSnapshot\(\)/);
});

test("a damaged RoomLog resume draft stays in the editor with an actionable error", () => {
  const restoreBody = viewerSource.split("async function restoreRoomLogEditorSnapshot()", 2)[1]
    ?.split("async function enableStaticDemoMode()", 1)[0] ?? "";
  assert.match(restoreBody, /try\s*\{/);
  assert.match(restoreBody, /catch \(error\)/);
  assert.match(restoreBody, /저장된 도면을 복원하지 못했습니다/);
  assert.match(restoreBody, /return false/);
});

test("a RoomLog handoff storage failure stays in the 3D editor", () => {
  const enterBody = viewerSource.split("async function enterFurnishingStage()", 2)[1]
    ?.split("function leaveFurnishingStage()", 1)[0] ?? "";
  assert.match(enterBody, /if \(roomLogFlowRequested && roomLogContext\) \{[\s\S]*?try \{/);
  assert.match(enterBody, /catch \(error\)[\s\S]*?가구 배치 화면을 열지 못했습니다/);
  assert.match(enterBody, /finally[\s\S]*?inFlight = false/);
});
