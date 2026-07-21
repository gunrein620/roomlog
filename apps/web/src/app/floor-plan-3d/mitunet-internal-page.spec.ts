import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeSource = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/mitunet/route.ts"), "utf8");
const proxySource = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/mitunet-proxy.ts"), "utf8");
const assetRouteSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/mitunet-assets/[...asset]/route.ts"),
  "utf8",
);
const apiRouteSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/mitunet-api/[...endpoint]/route.ts"),
  "utf8",
);
const composeSource = readFileSync(join(process.cwd(), "../../docker-compose.yml"), "utf8");
const productionComposeSource = readFileSync(
  join(process.cwd(), "../../docker-compose.prod.yml"),
  "utf8",
);
const furnitureDatasetSource = readFileSync(
  join(process.cwd(), "src/lib/furniture-dataset.ts"),
  "utf8",
);
const dockerIgnoreSource = readFileSync(join(process.cwd(), "../../.dockerignore"), "utf8");
const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);

test("serves the MitUNet viewer through a RoomLog route", () => {
  assert.match(routeSource, /readMitunetViewerFile\("index\.html"\)/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-assets\//);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/extract-image/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/compose-edits/);
  assert.match(proxySource, /\/floor-plan-3d\/room-materials/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/integration-config/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/healthz/);
  assert.match(viewerSource, /millimetersPerPixel:\s*currentComposedPlan\.calibration\?\.millimetersPerPixel/);
});

test("serves MitUNet viewer assets without exposing arbitrary local files", () => {
  assert.match(assetRouteSource, /resolveMitunetViewerFile/);
  assert.match(assetRouteSource, /transformRoomLogReviewEditorModule/);
  assert.match(assetRouteSource, /review-editor\.mjs/);
  assert.doesNotMatch(assetRouteSource, /transformRoomLogIntegrationModule/);
  assert.doesNotMatch(assetRouteSource, /roomlogListingFloorPlan3D/);
  assert.doesNotMatch(assetRouteSource, /\/sell\?flow=listing#my-page/);
});

test("proxies MitUNet inference requests from the RoomLog origin", () => {
  assert.match(apiRouteSource, /MITUNET_INTERNAL_SERVICE_URL/);
  assert.match(apiRouteSource, /extract-image/);
  assert.match(apiRouteSource, /compose-edits/);
  assert.match(apiRouteSource, /integration-config/);
  assert.match(apiRouteSource, /healthz/);
  assert.match(apiRouteSource, /applyRoomLogMitunetFormOptions/);
});

test("keeps completion inside RoomLog instead of using legacy external-window messaging", () => {
  assert.doesNotMatch(proxySource, /NEXT_PUBLIC_MITUNET_EDITOR_URL/);
  assert.doesNotMatch(proxySource, /postMessage/);
  assert.doesNotMatch(proxySource, /\bopener\s*\./);
  assert.doesNotMatch(proxySource, /transformRoomLogIntegrationModule/);
});

test("keeps the RoomLog save action visible and explains why it cannot be used yet", () => {
  assert.match(viewerSource, /id="roomlog-save-hint"/);
  assert.match(viewerSource, /const roomLogFlowRequested/);
  assert.match(viewerSource, /function roomLogSaveBlockReason\(\)/);
  assert.match(viewerSource, /connectRoomLogButton\.hidden = !roomLogFlowRequested;/);
  assert.match(viewerSource, /roomLogSaveHint\.textContent = roomLogSaveReason;/);
});

test("keeps the floor-plan upload action visible while live analysis initializes", () => {
  assert.match(viewerSource, /id="upload-btn"[^>]*aria-busy="true"[^>]*disabled/);
  assert.doesNotMatch(viewerSource, /id="upload-btn"[^>]*hidden/);
  assert.match(viewerSource, /uploadButton\.setAttribute\("aria-busy", "false"\)/);
  assert.match(viewerSource, /uploadButton\.disabled = !liveUploadAvailable \|\| inFlight/);
  assert.match(viewerSource, /Editor unavailable:[\s\S]*return false;/);
  assert.match(viewerSource, /도면 분석 서버에 연결할 수 없습니다/);
});

test("saves the current 3D or Floor surface for the RoomLog preview", () => {
  assert.match(
    viewerSource,
    /const previewMode = currentView === "furnishing" \? "floor" : "source"/,
  );
  assert.match(viewerSource, /await buildRoomLogPreviewImage\(currentComposedPlan\?\.input_image_b64\)/);
});

test("mounts MitUNet and furniture only from paths inside RoomLog", () => {
  for (const source of [composeSource, productionComposeSource]) {
    assert.match(source, /\.\/services\/mitunet/);
    assert.match(source, /\.\/runtime-assets\/furniture-glb-dataset/);
    assert.doesNotMatch(source, /\.\.\/\.\.\/floorplan-to-3d-mitunet/);
    assert.doesNotMatch(source, /\.\.\/furniture-glb-dataset/);
  }
});

test("uses RoomLog-internal defaults instead of deleted sibling fallbacks", () => {
  assert.match(proxySource, /services\/mitunet/);
  assert.match(furnitureDatasetSource, /runtime-assets\/furniture-glb-dataset/);
  assert.doesNotMatch(proxySource, /C:\/Users\/smoun\/Jungle\/floorplan-to-3d-mitunet/);
  assert.doesNotMatch(proxySource, /\.\.\/floorplan-to-3d-mitunet/);
});

test("keeps mounted model and furniture binaries out of the Docker build context", () => {
  assert.match(dockerIgnoreSource, /^services\/mitunet$/m);
  assert.match(dockerIgnoreSource, /^runtime-assets\/furniture-glb-dataset$/m);
});

test("keeps label-free floor generation available when room analysis fails", () => {
  assert.match(viewerSource, /let analysisRooms = \[\]/);
  assert.match(viewerSource, /catch \(error\) \{[\s\S]*?Room analysis unavailable/);
  assert.match(viewerSource, /rooms:\s*analysisRooms/);
});

test("uses the original upload for room classification while retaining the 1024px render image", () => {
  assert.match(
    viewerSource,
    /currentComposedPlan\.analysis_image_b64 \?\? currentComposedPlan\.input_image_b64/,
  );
  assert.match(viewerSource, /analysis_image_b64:\s*currentExtraction\?\.analysis_image_b64/);
});

test("renders the camera toolbar as labelled icon buttons without moving the editor tools", () => {
  assert.match(
    viewerSource,
    /id="camera-view-controls"[\s\S]*?data-camera-view="perspective"[^>]*aria-label="입체 보기"[^>]*>[\s\S]*?data-lucide="box"/,
  );
  assert.match(
    viewerSource,
    /data-camera-view="front"[^>]*aria-label="정면 보기"[^>]*>[\s\S]*?data-lucide="monitor"/,
  );
  assert.match(
    viewerSource,
    /data-camera-view="auto"[^>]*aria-label="자동 둘러보기"[^>]*>[\s\S]*?data-lucide="orbit"/,
  );
  assert.match(
    viewerSource,
    /#control-stack\s*\{[\s\S]*?top:\s*104px;[\s\S]*?left:\s*120px;/,
  );
  assert.match(
    viewerSource,
    /body\.view-3d:not\(\.upload-empty\)\s+#ui\s*\{[\s\S]*?top:\s*24px;[\s\S]*?left:\s*24px;[\s\S]*?padding:\s*12px 20px;/,
  );
  assert.match(viewerSource, /body\.view-3d:not\(\.upload-empty\)\s+\.camera-preset-row\s*\{\s*padding-bottom:\s*0;/);
});

test("places the furniture action in the bottom view switch instead of the stage card", () => {
  assert.match(
    viewerSource,
    /id="view-switch"[\s\S]*?<button class="segment" id="furnish-btn"[^>]*>가구 배치<\/button>/,
  );
  assert.match(viewerSource, /data-view="original"[^>]*>2D<\/button>/);
  assert.match(viewerSource, /data-view="3d"[^>]*>3D<\/button>/);
  assert.match(viewerSource, /\.segmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(viewerSource, /다음:\s*가구 배치/);
  assert.doesNotMatch(viewerSource, /id="structure-btn"/);
  assert.doesNotMatch(viewerSource, /구조 확인/);
  assert.match(viewerSource, /furnishButton\.hidden\s*=\s*false;/);
  assert.match(viewerSource, /viewButtons\.forEach\(button => \{\s*button\.disabled = !hasDocument \|\| inFlight;/);
  assert.match(
    viewerSource,
    /async function showFloorView\(\)\s*\{[\s\S]*?await showThreeDimensionalView\(\);[\s\S]*?await enterFurnishingStage\(\);/,
  );
  assert.match(viewerSource, /button\.dataset\.view === "furnishing"\) showFloorView\(\);/);
});

test("keeps the furniture catalog below the 3D toolbar with eight compact items per page", () => {
  assert.match(viewerSource, /const FURNITURE_PAGE_SIZE = 8;/);
  assert.match(
    viewerSource,
    /@media \(min-width: 721px\) \{[\s\S]*?body\.view-furnishing #furniture-panel\s*\{[\s\S]*?top:\s*116px;[\s\S]*?left:\s*24px;[\s\S]*?width:\s*312px;[\s\S]*?height:\s*calc\(100vh - 140px\);/,
  );
  assert.match(
    viewerSource,
    /body\.view-furnishing #furniture-results\s*\{[\s\S]*?grid-template-rows:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    viewerSource,
    /body\.view-furnishing \.furniture-card-swatch\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?min-height:\s*42px;/,
  );
});

test("does not suppress a furniture selection click after an earlier camera drag", () => {
  const pointerDownHandler = viewerSource.match(
    /sceneCanvas\.addEventListener\("pointerdown", event => \{[\s\S]*?\n\}\);/,
  )?.[0] ?? "";

  assert.match(pointerDownHandler, /furniturePointerMoved = false;/);
  assert.match(pointerDownHandler, /orbitGestureMoved = false;/);
  assert.match(pointerDownHandler, /suppressCanvasClick = false;/);
});

test("dismisses the furniture toolbar when the simulation is clicked outside the selected furniture", () => {
  assert.match(
    viewerSource,
    /function clearFurnitureSelection\(\) \{[\s\S]*?selectedFurniture = null;[\s\S]*?updateFurnitureInteractionUi\(\);/,
  );
  assert.match(
    viewerSource,
    /document\.addEventListener\("pointerdown", event => \{[\s\S]*?sceneCanvas\.contains\(event\.target\)[\s\S]*?furnitureToolbar\.contains\(event\.target\)[\s\S]*?clearFurnitureSelection\(\);/,
  );
});

test("keeps furniture placement available in both 3D and Floor while the slide drawer starts closed", () => {
  assert.match(
    viewerSource,
    /id="furniture-panel-open"[^>]*aria-label="가구 배치 열기"[^>]*>[\s\S]*?data-lucide="armchair"[\s\S]*?<span>가구 배치<\/span>/,
  );
  assert.match(
    viewerSource,
    /id="furniture-panel-close"[^>]*aria-label="가구 배치 접기"[^>]*>[\s\S]*?data-lucide="chevron-up"/,
  );
  assert.match(
    viewerSource,
    /body\.view-furnishing #furniture-panel\s*\{[\s\S]*?transform:\s*translateY\(-18px\);[\s\S]*?transition:\s*transform \.22s ease, opacity \.18s ease, visibility 0s linear \.22s;/,
  );
  assert.match(
    viewerSource,
    /body\.view-furnishing #furniture-panel\.is-open\s*\{[\s\S]*?visibility:\s*visible;[\s\S]*?transform:\s*translateY\(0\);/,
  );
  assert.match(
    viewerSource,
    /function setFurniturePanelOpen\(open\)\s*\{[\s\S]*?clearTimeout\(furniturePanelCloseTimer\);[\s\S]*?requestAnimationFrame\(\(\) => furniturePanel\.classList\.add\("is-open"\)\);[\s\S]*?furniturePanelCloseTimer = window\.setTimeout/,
  );
  assert.match(viewerSource, /furniturePanelCloseButton\.addEventListener\("click", \(\) => setFurniturePanelOpen\(false\)\);/);
  assert.match(
    viewerSource,
    /furniturePanelOpenButton\.addEventListener\("click", \(\) => \{[\s\S]*?setFurniturePanelOpen\(true\);[\s\S]*?void loadFurnitureCatalogForPlacement\(\);[\s\S]*?\}\);/,
  );
  assert.match(
    viewerSource,
    /function setFurniturePlacementVisibility\(visible\)\s*\{[\s\S]*?furnitureGroup\.visible = visible;[\s\S]*?placementPreviewGroup\.visible = visible;[\s\S]*?document\.body\.classList\.toggle\("view-furnishing", visible\);/,
  );
  assert.match(
    viewerSource,
    /function leaveFurnishingStage\(\)\s*\{[\s\S]*?currentView = "3d";[\s\S]*?setFurniturePlacementVisibility\(true\);[\s\S]*?setFurniturePanelOpen\(false\);/,
  );
  assert.match(
    viewerSource,
    /currentView = "furnishing";[\s\S]*?setFurniturePanelOpen\(false\);/,
  );
  assert.match(
    viewerSource,
    /function isFurniturePlacementView\(\)\s*\{\s*return currentView === "3d" \|\| currentView === "furnishing";\s*\}/,
  );
  assert.match(viewerSource, /function updateFurniturePreview\([\s\S]*?if \(!isFurniturePlacementView\(\) \|\| !pendingFurniture/);
  assert.match(viewerSource, /sceneCanvas\.addEventListener\("click", event => \{\s*if \(!isFurniturePlacementView\(\)\) return;/);
  assert.match(viewerSource, /window\.addEventListener\("keydown", event => \{\s*if \(!isFurniturePlacementView\(\)\) return;/);
});

test("keeps the original plan inside the walls while making its outer margin transparent in 3D", () => {
  assert.match(
    viewerSource,
    /function buildInputImagePlane\(b64, contentRect, scale, cx, cy, interiorMask, maskWidth, maskHeight\)/,
  );
  assert.match(
    viewerSource,
    /if \(!interiorMask\[sourceY \* maskWidth \+ sourceX\]\) imageData\.data\[pixelOffset \+ 3\] = 0;/,
  );
  assert.match(
    viewerSource,
    /buildInputImagePlane\([\s\S]*?interiorMask, width, height,/,
  );
  assert.match(
    viewerSource,
    /function setFurnishingVisibility\(furnishing\)\s*\{[\s\S]*?setPlanFloorSurfaceVisible\(furnishing\);/,
  );
  assert.match(viewerSource, /setCanvasViewState\(view\);[\s\S]*?setPlanFloorSurfaceVisible\(false\);/);
});

test("keeps the original-plan tool rail compact within a short desktop viewport", () => {
  assert.match(
    viewerSource,
    /#editor-tools\s*\{[\s\S]*?top:\s*40px;[\s\S]*?width:\s*72px;[\s\S]*?height:\s*calc\(100vh - 80px\);[\s\S]*?padding:\s*8px 6px;/,
  );
  assert.match(viewerSource, /#editor-tools\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(viewerSource, /#editor-tools \.tool-grid \.btn\s*\{[\s\S]*?min-height:\s*48px;/);
  assert.match(viewerSource, /#editor-rail-navigation \.btn\s*\{[\s\S]*?min-height:\s*34px;/);
  assert.match(viewerSource, /#editor-tools \.editor-rail-utility\s*\{[\s\S]*?min-height:\s*34px;/);
});

test("keeps the original-plan class legend compact", () => {
  assert.match(
    viewerSource,
    /#editor-class-legend\s*\{[\s\S]*?min-width:\s*152px;[\s\S]*?padding:\s*8px 10px;/,
  );
  assert.match(viewerSource, /#editor-class-legend \.legend\s*\{[\s\S]*?gap:\s*4px;/);
  assert.match(viewerSource, /#editor-class-legend \.legend-row\s*\{[\s\S]*?min-height:\s*20px;/);
  assert.match(viewerSource, /#editor-class-legend \.legend-row input\s*\{[\s\S]*?width:\s*12px;[\s\S]*?height:\s*12px;/);
  assert.match(viewerSource, /#editor-class-legend \.swatch\s*\{[\s\S]*?width:\s*12px;[\s\S]*?height:\s*12px;/);
});

test("anchors wall and scale context panels directly to their active rail button", () => {
  assert.match(
    viewerSource,
    /function positionEditorContextPanel\(activeToolButton\)\s*\{[\s\S]*?activeToolButton\.getBoundingClientRect\(\)[\s\S]*?editorTools\.getBoundingClientRect\(\)[\s\S]*?editorContextPanel\.style\.left\s*=\s*`\$\{Math\.round\(rect\.right - toolbarRect\.left\)\}px`[\s\S]*?editorContextPanel\.style\.top\s*=\s*`\$\{Math\.round\(rect\.top - toolbarRect\.top\)\}px`/,
  );
  assert.match(viewerSource, /#editor-context-panel\s*\{\s*position:\s*absolute;/);
  assert.match(
    viewerSource,
    /const activeToolButton = toolButtons\.find\(button => button\.dataset\.tool === selectedTool\);[\s\S]*?positionEditorContextPanel\(activeToolButton\);/,
  );
  assert.doesNotMatch(viewerSource, /#editor-context-panel\[data-context-tool="scale"\]\s*\{\s*top:/);
});

test("styles wall and scale context panels as compact rounded tool cards", () => {
  assert.match(
    viewerSource,
    /#editor-context-panel\s*\{[\s\S]*?width:\s*min\(220px, calc\(100vw - 88px\)\);[\s\S]*?height:\s*var\(--context-trigger-height, 48px\);[\s\S]*?padding:\s*6px;/,
  );
  assert.match(
    viewerSource,
    /#editor-context-panel\[data-context-tool="wall"\] \.label\s*\{\s*display:\s*none;/,
  );
  assert.match(
    viewerSource,
    /#editor-context-panel\[data-context-tool="scale"\] \.scale-summary\s*\{\s*display:\s*none;/,
  );
  assert.match(viewerSource, /#editor-context-panel \.scale-input-row input\s*\{[\s\S]*?height:\s*32px;/);
  assert.match(viewerSource, /#editor-context-panel \.brush-control\s*\{[\s\S]*?height:\s*32px;/);
  assert.match(viewerSource, /#editor-context-panel\s*\{[\s\S]*?border-radius:\s*(?:16px|var\(--radius-btn\));/);
});
