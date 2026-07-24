import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx"), "utf8");

test("floor-plan editor exposes the shared three furniture source tabs", () => {
  assert.match(source, /aria-label="가구 목록 종류"[\s\S]*내가구[\s\S]*등록된 가구[\s\S]*폴리/);
  assert.match(source, /loadPolyhavenCatalog/);
  assert.match(source, /fetchTenantFurniture/);
  assert.match(source, /isLargeFurnitureAsset/);
  assert.match(source, /Poly Haven · CC0/);
});
