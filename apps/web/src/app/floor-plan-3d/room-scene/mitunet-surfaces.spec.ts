import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MitunetFloorPlan, MitunetPolygon } from "@/lib/mitunet-floor-plan";
import { createMitunetSceneLayout } from "./mitunet-geometry";
import {
  buildInteriorMask,
  buildWoodRgba,
  calculateMitunetGroundBounds,
  calculateMitunetTexturePlane,
  maskContains
} from "./mitunet-surfaces";

const rectangle = (x1: number, y1: number, x2: number, y2: number): MitunetPolygon => ({
  outer: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
  holes: []
});

const plan: MitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "surface-test",
  canvasSize: [16, 16],
  contentRect: [0, 0, 16, 16],
  millimetersPerPixel: null,
  polygons: {
    wall: [
      rectangle(2, 2, 7, 3),
      rectangle(9, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14)
    ],
    door: [rectangle(7, 2, 9, 3)],
    window: []
  }
};

describe("MitUNet surfaces", () => {
  it("adds twelve percent of the long side on every ground edge", () => {
    assert.deepEqual(
      calculateMitunetGroundBounds({ centerX: 3, centerZ: -2, width: 20, depth: 10 }),
      { centerX: 3, centerZ: -2, width: 24.8, depth: 14.8, padding: 2.4 }
    );
  });

  it("temporarily seals doors while preserving doorway floor", () => {
    const mask = buildInteriorMask(plan.polygons, 16, 16);
    assert.equal(maskContains(mask, 16, 16, 8, 8), true);
    assert.equal(maskContains(mask, 16, 16, 8, 2), true);
    assert.equal(maskContains(mask, 16, 16, 0, 0), false);
  });

  it("emits opaque wood only for interior pixels", () => {
    const mask = buildInteriorMask(plan.polygons, 16, 16);
    const rgba = buildWoodRgba(mask, 16, 16);
    assert.equal(rgba[(8 * 16 + 8) * 4 + 3], 255);
    assert.equal(rgba[3], 0);
    assert.deepEqual(buildWoodRgba(mask, 16, 16), rgba);
  });

  it("aligns the full texture canvas with the centered polygon layout", () => {
    const layout = createMitunetSceneLayout(plan);
    const plane = calculateMitunetTexturePlane(plan, layout);
    assert.ok(plane.width > layout.bounds.width);
    assert.ok(plane.depth > layout.bounds.depth);
    assert.equal(Number.isFinite(plane.centerX), true);
    assert.equal(Number.isFinite(plane.centerZ), true);
  });
});
