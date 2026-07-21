import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const tourSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const editorSource = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx"), "utf8");

function between(source: string, start: string, end: string) {
  const afterStart = source.split(start, 2)[1];
  assert.ok(afterStart, `missing start marker: ${start}`);
  const body = afterStart.split(end, 1)[0];
  assert.ok(body, `missing end marker: ${end}`);
  return body;
}

test("loads the 3D rendering GLB furniture catalog for the listing tour", () => {
  assert.match(tourSource, /loadGlbDatasetCatalog/);
  assert.match(tourSource, /const \[furnitureCatalog, setFurnitureCatalog\] = useState<FurnitureCatalogItem\[\]>\(FURNITURE_CATALOG\)/);
  assert.match(tourSource, /const datasetItems = await loadGlbDatasetCatalog\(\)/);
  assert.match(tourSource, /setFurnitureCatalog\(datasetItems\)/);
  assert.match(tourSource, /const matchesQuery = !normalizedQuery \|\| catalogSearchText\(item\)\.includes\(normalizedQuery\)/);
});

test("uses the same furniture categories as the 3D rendering editor", () => {
  assert.match(editorSource, /listFurnitureCategoryFilters/);
  assert.match(editorSource, /furnitureCategoryLabel,\s*\n\s*furnitureImageUrl/);
  assert.match(tourSource, /listFurnitureCategoryFilters/);
  assert.match(tourSource, /const \[furnitureCategoryFilter, setFurnitureCategoryFilter\] = useState\("전체"\)/);
  assert.match(tourSource, /const furnitureCategoryFilters = useMemo/);
  assert.match(tourSource, /matchesCategory/);
  assert.match(tourSource, /listing-tour-furniture-category-tabs/);
});

test("opens the 500-item furniture editor from the 3D simulation request", () => {
  assert.match(tourSource, /const \[furnitureLimit, setFurnitureLimit\] = useState\(30\)/);
  assert.match(tourSource, /const visibleFurnitureCatalog = useMemo/);
  assert.match(tourSource, /simulationOpen\?: boolean/);
  assert.match(tourSource, /if \(simulationOpen\)[\s\S]*setSimulationMode\("walk"\)/);
  assert.match(tourSource, /가구 더 보기 \(\{visibleFurnitureCatalog\.length\}\/\{filteredCatalog\.length\}\)/);
});

test("defaults the fullscreen simulation to walk and switches explicitly to furniture placement", () => {
  assert.match(tourSource, /type SimulationMode = "walk" \| "furniture"/);
  assert.match(tourSource, /const \[simulationMode, setSimulationMode\] = useState<SimulationMode>\("walk"\)/);
  assert.match(tourSource, /role="tablist"[\s\S]*워킹뷰[\s\S]*가구 배치/);
  assert.match(tourSource, /controlMode=\{simulationOpen && simulationMode === "walk" \? "walk" : "orbit"\}/);
  assert.match(tourSource, /simulationMode === "furniture"/);
});

test("cancels an unconfirmed furniture draft before entering walk mode", () => {
  assert.match(
    tourSource,
    /function selectSimulationMode\(nextMode: SimulationMode\)[\s\S]*nextMode === "walk" && pendingFurniture[\s\S]*cancelPendingFurniturePlacement\(\)/
  );
  assert.match(tourSource, /restorePendingFurnitureOrigin\(\)/);
});

test("reuses the touch joystick for coarse-pointer walk input", () => {
  assert.match(tourSource, /TourJoystick, type TourJoystickVector/);
  assert.match(tourSource, /window\.matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(tourSource, /moveInputRef=\{walkMoveInputRef\}/);
  assert.match(tourSource, /isCoarsePointer[\s\S]*<TourJoystick onChange=\{handleWalkJoystickChange\}/);
});

test("connects both pending-furniture rotation directions to the listing tour", () => {
  assert.match(tourSource, /function rotatePendingFurniture\(direction: -1 \| 1\)/);
  assert.match(tourSource, /rotateFurnitureQuarterTurn\(pendingFurniture, direction\)/);
  assert.match(tourSource, /onPendingRotate=\{rotatePendingFurniture\}/);
});

test("only enables pending deletion while an existing tour furniture item is being edited", () => {
  assert.match(tourSource, /const \[isPendingFurnitureEditing, setIsPendingFurnitureEditing\] = useState\(false\)/);
  assert.match(tourSource, /setIsPendingFurnitureEditing\(true\)/);
  assert.match(tourSource, /pendingFurnitureCanBeDeleted=\{isPendingFurnitureEditing\}/);
  assert.match(tourSource, /function deletePendingFurniture\(\)[\s\S]*?setIsPendingFurnitureEditing\(false\)/);
});

test("uses the MitUNet selection stage before moving an existing listing furniture item", () => {
  const pointerHandler = between(
    tourSource,
    "function handleFurniturePointerDown",
    "function confirmPendingFurniturePlacement"
  );
  assert.match(pointerHandler, /setSelectedFurnitureId\(furniture\.id\)/);
  assert.doesNotMatch(pointerHandler, /setPendingFurniture\(reopenFurnitureDraft\(furniture\)\)/);

  const moveHandler = between(
    tourSource,
    "function beginSelectedFurnitureMove",
    "function rotateSelectedFurniture"
  );
  assert.match(moveHandler, /pendingFurnitureOriginRef\.current = furniture/);
  assert.match(moveHandler, /setPendingFurniture\(reopenFurnitureDraft\(furniture\)\)/);
});

test("keeps a confirmed listing furniture item selected for the floating toolbar", () => {
  assert.match(tourSource, /setSelectedFurnitureId\(nextFurniture\.id\)/);
  assert.match(tourSource, /onSelectedMove=\{beginSelectedFurnitureMove\}/);
  assert.match(tourSource, /onSelectedRotateLeft=\{\(\) => rotateSelectedFurniture\(-1\)\}/);
  assert.match(tourSource, /onSelectedRotateRight=\{\(\) => rotateSelectedFurniture\(1\)\}/);
  assert.match(tourSource, /onSelectedDelete=\{deleteSelectedFurniture\}/);
});
