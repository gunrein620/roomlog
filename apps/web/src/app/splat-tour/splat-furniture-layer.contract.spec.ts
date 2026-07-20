import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/splat-tour/splat-furniture-layer.tsx", "utf8");

describe("splat furniture layer edit contract", () => {
  it("accepts a pending furniture draft and placement callbacks", () => {
    assert.match(source, /pendingFurniture/);
    assert.match(source, /onFloorPointerDown/);
    assert.match(source, /onFurniturePointerDown/);
  });

  it("renders an edit-only floor hit target", () => {
    assert.match(source, /shouldEnableTourFurnitureFloor/);
    assert.match(source, /planeGeometry/);
    assert.match(source, /event\.stopPropagation\(\)/);
  });
});
