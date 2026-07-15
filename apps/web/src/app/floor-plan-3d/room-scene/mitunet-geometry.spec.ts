import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { createMitunetSceneLayout } from "./mitunet-geometry";

const plan: MitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "sample",
  canvasSize: [1000, 800],
  contentRect: [100, 100, 800, 600],
  millimetersPerPixel: null,
  polygons: {
    wall: [{ outer: [[100, 100], [900, 100], [900, 130], [100, 130]], holes: [] }],
    door: [{ outer: [[450, 100], [550, 100], [550, 130], [450, 130]], holes: [] }],
    window: []
  }
};

describe("createMitunetSceneLayout", () => {
  it("centers an uncalibrated plan and fits its long side to ten metres", () => {
    const layout = createMitunetSceneLayout(plan);

    assert.equal(layout.bounds.width, 10);
    assert.equal(layout.bounds.depth, 7.5);
    assert.deepEqual(layout.wall[0].outer[0], [-5, -3.75]);
    assert.deepEqual(layout.wall[0].outer[2], [5, -3.375]);
  });

  it("uses millimetres-per-pixel calibration when available", () => {
    const layout = createMitunetSceneLayout({ ...plan, millimetersPerPixel: 5 });

    assert.equal(layout.bounds.width, 4);
    assert.equal(layout.bounds.depth, 3);
    assert.deepEqual(layout.door[0].outer[0], [-0.25, -1.5]);
  });
});
