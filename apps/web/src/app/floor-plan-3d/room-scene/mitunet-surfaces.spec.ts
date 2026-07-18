import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MitunetFloorPlan, MitunetPolygon } from "@/lib/mitunet-floor-plan";
import { createMitunetSceneLayout } from "./mitunet-geometry";
import {
  buildFloorMaterialRgba,
  buildInteriorMask,
  buildRoomlogInteriorMask,
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

  it("renders distinct saved room materials from the encoded label map", () => {
    const mask = new Uint8Array(8).fill(1);
    const rgba = buildFloorMaterialRgba(mask, 4, 2, {
      encoding: "rle-u8",
      height: 2,
      labels: "4:1,4:2",
      version: 1,
      width: 4,
      zones: [
        { confidence: 0.98, id: "room-1", label: "bedroom", material: "WOOD", roomType: "bedroom", seed: [0, 0] },
        { confidence: 0.97, id: "room-2", label: "bathroom", material: "TILE", roomType: "bathroom", seed: [0, 1] },
      ],
    });

    assert.equal(rgba[3], 255);
    assert.equal(rgba[(4 * 4) + 3], 255);
    assert.notDeepEqual(Array.from(rgba.slice(0, 3)), Array.from(rgba.slice(16, 19)));
  });

  it("keeps the legacy wood finish when a saved plan has no material map", () => {
    const mask = new Uint8Array(8).fill(1);
    assert.deepEqual(
      buildFloorMaterialRgba(mask, 4, 2),
      buildWoodRgba(mask, 4, 2),
    );
  });

  it("renders a previously saved kitchen floor zone with the wood finish", () => {
    const mask = new Uint8Array(8).fill(1);
    const floorMaterials = {
      encoding: "rle-u8" as const,
      height: 2,
      labels: "8:1",
      version: 1 as const,
      width: 4,
      zones: [{
        confidence: 0.98,
        id: "room-1",
        label: "kitchen",
        material: "KITCHEN_FLOOR" as const,
        roomType: "kitchen",
        seed: [0, 0] as [number, number],
      }],
    };

    assert.deepEqual(
      buildFloorMaterialRgba(mask, 4, 2, floorMaterials),
      buildWoodRgba(mask, 4, 2),
    );
  });

  it("recovers interior floor when the saved payload omits a rejected doorway barrier", () => {
    const polygons = {
      wall: [
        rectangle(18, 18, 36, 20),
        rectangle(60, 18, 78, 20),
        rectangle(18, 76, 38, 78),
        rectangle(58, 76, 78, 78),
        rectangle(18, 18, 20, 78),
        rectangle(76, 18, 78, 78)
      ],
      door: [rectangle(38, 76, 58, 78)],
      window: []
    };

    assert.equal(maskContains(buildInteriorMask(polygons, 96, 96), 96, 96, 48, 48), false);
    assert.equal(maskContains(buildRoomlogInteriorMask(polygons, 96, 96), 96, 96, 48, 48), true);
  });

  it("aligns the full texture canvas with the centered polygon layout", () => {
    const planWithBottomWhitespace = { ...plan, canvasSize: [16, 20] as [number, number] };
    const layout = createMitunetSceneLayout(planWithBottomWhitespace);
    const plane = calculateMitunetTexturePlane(planWithBottomWhitespace, layout);
    assert.ok(plane.width > layout.bounds.width);
    assert.ok(plane.depth > layout.bounds.depth);
    assert.equal(Number.isFinite(plane.centerX), true);
    assert.equal(Math.round(plane.centerZ * 1e6) / 1e6, 1.333333);
  });
});
