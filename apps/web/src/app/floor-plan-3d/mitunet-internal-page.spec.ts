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

test("serves the MitUNet viewer through a RoomLog route", () => {
  assert.match(routeSource, /readMitunetViewerFile\("index\.html"\)/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-assets\//);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/extract-image/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/compose-edits/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/integration-config/);
  assert.match(proxySource, /\/floor-plan-3d\/mitunet-api\/healthz/);
});

test("serves MitUNet viewer assets without exposing arbitrary local files", () => {
  assert.match(assetRouteSource, /resolveMitunetViewerFile/);
  assert.match(assetRouteSource, /transformRoomLogIntegrationModule/);
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
});

test("keeps completion inside RoomLog instead of using legacy external-window messaging", () => {
  assert.doesNotMatch(proxySource, /NEXT_PUBLIC_MITUNET_EDITOR_URL/);
  assert.doesNotMatch(proxySource, /postMessage/);
  assert.doesNotMatch(proxySource, /\bopener\b/);
  assert.match(proxySource, /window\.localStorage\.setItem/);
  assert.match(proxySource, /window\.location\.href/);
});
