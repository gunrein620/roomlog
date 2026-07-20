import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { transformMitunetViewerHtml } from "./mitunet-proxy";
import * as mitunetProxy from "./mitunet-proxy";

const integrationSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/roomlog-integration.mjs"),
  "utf8",
);

test("keeps 3D plan saving available in the RoomLog flow", () => {
  const transformed = transformMitunetViewerHtml(`
    <button id="save-json-btn"><span>Save JSON</span></button>
    <button id="connect-roomlog-btn" title="Connect this 3D plan to RoomLog"><span>RoomLog에 연결</span></button>
    <script>saveJsonButton.hidden = !canSave;</script>
  `);

  assert.match(transformed, /title="3D 도면을 저장하고 매물 등록으로 돌아가기"/);
  assert.match(transformed, /3D 도면 저장하기/);
  assert.doesNotMatch(transformed, /RoomLog에 연결/);
  assert.match(transformed, /saveJsonButton\.hidden = !canSave;/);
  assert.doesNotMatch(transformed, /saveJsonButton\.hidden = !canSave \|\| Boolean\(roomLogContext\);/);
});

test("rewrites relative demo sample paths to the mitunet-assets route", () => {
  const transformed = transformMitunetViewerHtml(`
    <script>
      const response = await fetch("./demos/manifest.json", { cache: "no-store" });
      fetchAndLoad(\`./demos/\${encodeURIComponent(demoSelect.value)}.json\`);
    </script>
  `);

  assert.match(transformed, /fetch\("\/floor-plan-3d\/mitunet-assets\/demos\/manifest\.json"/);
  assert.match(transformed, /`\/floor-plan-3d\/mitunet-assets\/demos\/\$\{encodeURIComponent\(demoSelect\.value\)\}\.json`/);
  assert.doesNotMatch(transformed, /"\.\/demos\//);
  assert.doesNotMatch(transformed, /`\.\/demos\//);
});

test("keeps RoomLog completion behavior in the source module instead of runtime source replacement", () => {
  assert.match(
    integrationSource,
    /sendRoomLogCompletion\(context, plan, sourceName, furnitures = \[\]\)/,
  );
  assert.match(integrationSource, /const storageKey = `roomlogListingFloorPlan3D:\$\{context\.requestId\}`;/);
  assert.match(integrationSource, /window\.localStorage\.setItem\(storageKey, JSON\.stringify\(storageValue\)\);/);
  assert.match(integrationSource, /returnUrl\.searchParams\.set\("floorPlanRequestId", context\.requestId\);/);
  assert.match(integrationSource, /window\.location\.href = returnUrl\.toString\(\);/);
  assert.doesNotMatch(integrationSource, /postMessage/);
  assert.equal(
    typeof (mitunetProxy as Record<string, unknown>).transformRoomLogIntegrationModule,
    "undefined",
  );
});

test("disables detected-door auto scale only in the RoomLog viewer", () => {
  const transform = (mitunetProxy as Record<string, unknown>)[
    "transformRoomLogReviewEditorModule"
  ];
  assert.equal(typeof transform, "function");
  if (typeof transform !== "function") return;

  const transformed = transform(`
    this.calibration = estimateCalibrationFromDoors(this.document.openings);
  `) as string;

  assert.match(transformed, /this\.calibration = null;/);
  assert.doesNotMatch(transformed, /estimateCalibrationFromDoors\(this\.document\.openings\)/);
});

test("uses copy walls for 3D composition without changing extraction requests", () => {
  const applyOptions = (mitunetProxy as Record<string, unknown>)[
    "applyRoomLogMitunetFormOptions"
  ];
  assert.equal(typeof applyOptions, "function");
  if (typeof applyOptions !== "function") return;

  const composeForm = new FormData();
  const extractForm = new FormData();
  applyOptions("compose-edits", composeForm);
  applyOptions("extract-image", extractForm);

  assert.equal(composeForm.get("wall_polygon_mode"), "copy-wall");
  assert.equal(extractForm.get("wall_polygon_mode"), null);
});
