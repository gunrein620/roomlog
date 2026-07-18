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
  assert.match(assetRouteSource, /transformRoomLogIntegrationModule/);
  assert.match(assetRouteSource, /transformRoomLogReviewEditorModule/);
  assert.match(assetRouteSource, /review-editor\.mjs/);
  assert.match(assetRouteSource, /roomlogListingFloorPlan3D/);
  assert.match(assetRouteSource, /\/?flow=listing#my-page/);
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
  assert.match(proxySource, /window\.localStorage\.setItem/);
  assert.match(proxySource, /window\.location\.href/);
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
