import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

test("prepares room floor materials before showing the furnishing floor", () => {
  assert.match(source, /async function ensureRoomFloorMaterials/);
  assert.match(source, /currentComposedPlan\.floor_materials/);

  const start = source.indexOf("async function enterFurnishingStage()");
  const end = source.indexOf("\nfunction leaveFurnishingStage", start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(body.indexOf("await ensureRoomFloorMaterials") >= 0);
  assert.ok(body.indexOf("await ensureRoomFloorMaterials") < body.indexOf("setFurnishingVisibility(true)"));
});

test("keeps room analysis failure on the existing wood fallback", () => {
  assert.match(source, /catch \(error\)[\s\S]*?rebuildFloorFinish/);
  assert.match(source, /buildFloorFinishRgba/);
});

test("keeps the room analysis warning visible after furniture catalog loading", () => {
  const start = source.indexOf("async function enterFurnishingStage()");
  const end = source.indexOf("\nfunction leaveFurnishingStage", start);
  const body = source.slice(start, end);

  assert.match(body, /let roomMaterialWarning = ""/);
  assert.match(body, /roomMaterialWarning =/);
  assert.match(body, /if \(roomMaterialWarning\)/);
  assert.ok(body.lastIndexOf("roomMaterialWarning") > body.indexOf("await ensureFurnitureCatalog"));
});
