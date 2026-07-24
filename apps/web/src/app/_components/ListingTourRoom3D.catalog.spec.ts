import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const tourSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const editorSource = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx"), "utf8");
// 가구 목록 UI(검색·카테고리·더보기·Poly Haven 탭)는 PR #167에서 공유 패널로 추출됐다 —
// 호스트는 등록 가구(glb)만 로드해 catalogItems로 넘기고, 나머지는 이 패널이 소유한다.
const panelSource = readFileSync(join(process.cwd(), "src/app/_components/FurnitureCatalogPanel.tsx"), "utf8");

function between(source: string, start: string, end: string) {
  const afterStart = source.split(start, 2)[1];
  assert.ok(afterStart, `missing start marker: ${start}`);
  const body = afterStart.split(end, 1)[0];
  assert.ok(body, `missing end marker: ${end}`);
  return body;
}

test("loads the 3D rendering GLB furniture catalog and delegates listing to the shared panel", () => {
  // 호스트는 등록 가구(glb 데이터셋)만 로드해 catalogItems로 패널에 넘긴다.
  assert.match(tourSource, /loadGlbDatasetCatalog/);
  assert.match(tourSource, /const datasetItems = await loadGlbDatasetCatalog\(\)/);
  assert.match(tourSource, /<FurnitureCatalogPanel/);
  // 검색 매칭은 패널이 소유한다.
  assert.match(panelSource, /const matchesQuery = !normalizedQuery \|\| catalogSearchText\(item\)\.includes\(normalizedQuery\)/);
});

test("lazy-loads the independent Poly Haven catalog inside the shared panel", () => {
  // Poly Haven은 두 호스트가 공유하는 CC0 자산이라 패널이 로딩·에러·재시도를 내부에서 소유한다.
  assert.match(panelSource, /const \[polyCatalog, setPolyCatalog\] = useState<FurnitureCatalogItem\[\]>\(\[\]\)/);
  assert.match(panelSource, /sourceTab !== "poly"/);
  assert.match(panelSource, /loadPolyhavenCatalog\(\)/);
  assert.match(panelSource, /setPolyCatalog\(items\)/);
  assert.match(panelSource, /Poly Haven · CC0/);
  assert.match(panelSource, /export type FurnitureSourceTab = "mine" \| "catalog" \| "poly"/);
});

test("uses the same furniture categories as the 3D rendering editor", () => {
  assert.match(editorSource, /listFurnitureCategoryFilters/);
  assert.match(editorSource, /furnitureCategoryLabel,\s*\n\s*furnitureImageUrl/);
  // 카테고리 필터·탭 UI는 패널로 이동했다. 호스트는 선택된 카테고리 상태만 들고 패널에 넘긴다.
  assert.match(tourSource, /const \[furnitureCategoryFilter, setFurnitureCategoryFilter\] = useState\("전체"\)/);
  assert.match(panelSource, /listFurnitureCategoryFilters/);
  assert.match(panelSource, /const categoryFilters = useMemo/);
  assert.match(panelSource, /matchesCategory/);
  assert.match(panelSource, /listing-tour-furniture-category-tabs/);
});

test("opens the paginated furniture editor from the 3D simulation request", () => {
  // 목록 페이지네이션("더 보기")도 패널이 소유한다.
  assert.match(panelSource, /const \[catalogLimit, setCatalogLimit\] = useState\(30\)/);
  assert.match(panelSource, /const visibleCatalog = useMemo/);
  assert.match(panelSource, /가구 더 보기 \(\{visibleCatalog\.length\}\/\{filteredCatalog\.length\}\)/);
  assert.match(tourSource, /simulationOpen\?: boolean/);
  assert.match(tourSource, /if \(simulationOpen\)[\s\S]*setSimulationMode\(initialSimulationMode\)/);
});

test("supports owner overview while defaulting the fullscreen simulation to walk", () => {
  assert.match(tourSource, /type SimulationMode = "overview" \| "walk" \| "furniture"/);
  assert.match(tourSource, /initialSimulationMode = "walk"/);
  assert.match(tourSource, /const \[simulationMode, setSimulationMode\] = useState<SimulationMode>\(initialSimulationMode\)/);
  assert.match(tourSource, /role="tablist"[\s\S]*워킹뷰[\s\S]*가구 배치/);
  assert.match(tourSource, /controlMode=\{simulationOpen && simulationMode === "walk" \? "walk" : "orbit"\}/);
  assert.match(tourSource, /simulationMode === "furniture"/);
});

test("cancels an unconfirmed furniture draft before entering walk mode", () => {
  assert.match(
    tourSource,
    /function selectSimulationMode\(nextMode: SimulationMode\)[\s\S]*nextMode !== "furniture" && pendingFurniture[\s\S]*cancelPendingFurniturePlacement\(\)/
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
  assert.match(tourSource, /rotateFurnitureForPlacement\(pendingFurniture, direction\)/);
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

  const moveByIdHandler = between(
    tourSource,
    "function beginFurnitureMoveById",
    "function beginSelectedFurnitureMove"
  );
  assert.match(moveByIdHandler, /pendingFurnitureOriginRef\.current = furniture/);
  assert.match(moveByIdHandler, /setPendingFurniture\(reopenFurnitureDraft\(furniture\)\)/);

  const selectedMoveHandler = between(
    tourSource,
    "function beginSelectedFurnitureMove",
    "function rotateSelectedFurniture"
  );
  assert.match(selectedMoveHandler, /beginFurnitureMoveById\(selectedFurnitureId\)/);
});

test("keeps a confirmed listing furniture item selected for the floating toolbar", () => {
  assert.match(tourSource, /setSelectedFurnitureId\(nextFurniture\.id\)/);
  assert.match(tourSource, /onSelectedMove=\{beginSelectedFurnitureMove\}/);
  assert.match(tourSource, /onSelectedRotateLeft=\{\(\) => rotateSelectedFurniture\(-1\)\}/);
  assert.match(tourSource, /onSelectedRotateRight=\{\(\) => rotateSelectedFurniture\(1\)\}/);
  assert.match(tourSource, /onSelectedDelete=\{deleteSelectedFurniture\}/);
});
