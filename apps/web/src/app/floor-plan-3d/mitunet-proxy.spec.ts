import assert from "node:assert/strict";
import test from "node:test";

import {
  transformMitunetViewerHtml,
  transformRoomLogIntegrationModule,
} from "./mitunet-proxy";
import * as mitunetProxy from "./mitunet-proxy";

test("uses a save-and-return action instead of the RoomLog connection copy", () => {
  const transformed = transformMitunetViewerHtml(`
    <button id="save-json-btn"><span>Save JSON</span></button>
    <button id="connect-roomlog-btn" title="Connect this 3D plan to RoomLog"><span>RoomLog에 연결</span></button>
    <script>saveJsonButton.hidden = !canSave;</script>
  `);

  assert.match(transformed, /title="3D 도면을 저장하고 매물 등록으로 돌아가기"/);
  assert.match(transformed, /3D 도면 저장하기/);
  assert.doesNotMatch(transformed, /RoomLog에 연결/);
  assert.match(transformed, /saveJsonButton\.hidden = !canSave \|\| Boolean\(roomLogContext\);/);
});

test("keeps the viewer completion signature and stores mapped furniture records", () => {
  const transformed = transformRoomLogIntegrationModule(`
export function sendRoomLogCompletion(context, plan, sourceName, opener, furnitures = []) {
  const message = buildRoomLogCompletion(context, plan, sourceName, furnitures);
  opener.postMessage(message, context.returnOrigin);
  return message;
}
`, "roomlog:floor-plan-draft", "/landlord/listings/new");

  assert.match(
    transformed,
    /sendRoomLogCompletion\(context, plan, sourceName, opener, furnitures = \[\]\)/,
  );
  assert.match(
    transformed,
    /buildRoomLogCompletion\(context, plan, sourceName, furnitures\)/,
  );
  assert.match(transformed, /furnitures: message\.payload\.furnitures/);
  assert.doesNotMatch(transformed, /furnitures: \[\]/);
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
