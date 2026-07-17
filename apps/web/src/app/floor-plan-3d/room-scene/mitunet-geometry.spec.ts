import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import * as geometry from "./mitunet-geometry";

const { createMitunetSceneLayout } = geometry;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

const plan: MitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "sample",
  canvasSize: [1000, 800],
  contentRect: [0, 0, 1000, 800],
  millimetersPerPixel: null,
  polygons: {
    wall: [{ outer: [[200, 100], [600, 100], [600, 140], [200, 140]], holes: [] }],
    door: [{ outer: [[350, 100], [450, 100], [450, 140], [350, 140]], holes: [] }],
    window: [{ outer: [[300, 300], [500, 300], [500, 340], [300, 340]], holes: [] }]
  }
};

describe("createMitunetSceneLayout", () => {
  it("centers an uncalibrated plan and fits its long side to the viewer's eight metres", () => {
    const layout = createMitunetSceneLayout(plan);

    assert.equal(layout.hasPhysicalScale, false);
    assert.equal(layout.bounds.width, 8);
    assert.equal(layout.bounds.depth, 4.8);
    assert.deepEqual(layout.wall[0].outer[0], [-4, 2.4]);
    assert.deepEqual(layout.wall[0].outer[2].map(round), [4, 1.6]);
    assert.deepEqual(layout.window[0].outer[2].map(round), [2, -2.4]);
  });

  it("uses millimetres-per-pixel calibration when available", () => {
    const layout = createMitunetSceneLayout({ ...plan, millimetersPerPixel: 5 });

    assert.equal(layout.hasPhysicalScale, true);
    assert.equal(layout.bounds.width, 2);
    assert.equal(layout.bounds.depth, 1.2);
    assert.deepEqual(layout.door[0].outer[0].map(round), [-0.25, 0.6]);
  });

  it("keeps MitUNet at scene scale one and normalizes legacy tour coordinates", () => {
    const helpers = geometry as unknown as {
      normalizeTourScenePoint?: (
        point: { x: number; z: number },
        sceneScale: number,
      ) => { x: number; z: number };
      resolveTourSceneScale?: (
        mitunetPlan: MitunetFloorPlan | undefined,
        legacyScale: number,
      ) => number;
    };

    assert.equal(typeof helpers.resolveTourSceneScale, "function");
    assert.equal(typeof helpers.normalizeTourScenePoint, "function");
    assert.equal(helpers.resolveTourSceneScale?.(plan, 1.85), 1);
    assert.deepEqual(helpers.normalizeTourScenePoint?.({ x: 3.7, z: -1.85 }, 1), {
      x: 3.7,
      z: -1.85,
    });
    assert.equal(helpers.resolveTourSceneScale?.(undefined, 1.85), 1.85);
    assert.deepEqual(helpers.normalizeTourScenePoint?.({ x: 3.7, z: -1.85 }, 1.85), {
      x: 2,
      z: -1,
    });
  });
});
