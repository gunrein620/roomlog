import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { normalizeMitunetFloorPlan } from "./mitunet-floor-plan";

const validPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "sample.png",
  canvasSize: [800, 600],
  contentRect: [10, 20, 760, 540],
  millimetersPerPixel: 4.25,
  polygons: {
    wall: [{ outer: [[10, 10], [100, 10], [100, 30], [10, 30]], holes: [] }],
    door: [],
    window: []
  }
};

describe("normalizeMitunetFloorPlan", () => {
  it("keeps a valid RoomLog MitUNet polygon payload", () => {
    assert.deepEqual(normalizeMitunetFloorPlan(validPlan), validPlan);
  });

  it("keeps the saved 3D source image for the listing preview", () => {
    const sourcePlan = {
      ...validPlan,
      surfaceMode: "source" as const,
      sourceImageB64: "cGxhbg=="
    };

    assert.deepEqual(normalizeMitunetFloorPlan(sourcePlan), sourcePlan);
  });

  it("rejects payloads without walls or with non-finite points", () => {
    assert.equal(normalizeMitunetFloorPlan({ ...validPlan, polygons: { wall: [], door: [], window: [] } }), null);
    assert.equal(
      normalizeMitunetFloorPlan({
        ...validPlan,
        polygons: {
          wall: [{ outer: [[10, 10], [Number.POSITIVE_INFINITY, 10], [100, 30]], holes: [] }],
          door: [],
          window: []
        }
      }),
      null
    );
  });

  it("normalizes invalid calibration to null and trims the name", () => {
    const normalized = normalizeMitunetFloorPlan({
      ...validPlan,
      name: `  ${"x".repeat(140)}  `,
      millimetersPerPixel: -1
    });
    assert.equal(normalized?.name.length, 120);
    assert.equal(normalized?.millimetersPerPixel, null);
  });
});
