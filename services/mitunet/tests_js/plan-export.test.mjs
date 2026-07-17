import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlanExport,
  planExportFilename,
} from "../viewer/plan-export.mjs";

test("saved project JSON keeps geometry openings scale and source image", () => {
  const saved = buildPlanExport({
    polygons: {
      wall: [{ outer: [[0, 0], [20, 0], [20, 8]], holes: [] }],
      door: [],
      window: [],
    },
    openings: [{ id: "door-1", kind: "door", center_x: 10, center_y: 2 }],
    calibration: { millimetersPerPixel: 12.5 },
    input_image_b64: "cGxhbg==",
  }, {
    sourceName: "apartment.png",
    savedAt: "2026-07-14T12:00:00.000Z",
  });

  assert.equal(saved.schema, "mitunet-floorplan-3d-project");
  assert.equal(saved.version, 1);
  assert.equal(saved.saved_at, "2026-07-14T12:00:00.000Z");
  assert.equal(saved.source_name, "apartment.png");
  assert.equal(saved.plan.calibration.millimetersPerPixel, 12.5);
  assert.equal(saved.plan.openings[0].id, "door-1");
  assert.equal(saved.plan.polygons.wall.length, 1);
  assert.equal(saved.plan.input_image_b64, "cGxhbg==");
});

test("export filename is safe and keeps the source base name", () => {
  assert.equal(planExportFilename("Apartment plan.png"), "Apartment-plan-3d.json");
  assert.equal(planExportFilename(""), "floorplan-3d.json");
});

test("saving requires composed polygon data", () => {
  assert.throws(() => buildPlanExport(null), /composed plan/i);
  assert.throws(() => buildPlanExport({ openings: [] }), /polygon/i);
});

test("saved project includes furniture placements without runtime objects", () => {
  const saved = buildPlanExport({ polygons: { wall: [{}], door: [], window: [] } }, {
    furnitures: [{
      id: "chair-1",
      relativePath: "chair/oak-chair.glb",
      position: [1, 0, 2],
      rotationY: Math.PI / 2,
      sizeMm: { width: 500, height: 800, depth: 520 },
      runtimeMesh: {},
    }],
  });
  assert.equal(saved.furnitures.length, 1);
  assert.equal("runtimeMesh" in saved.furnitures[0], false);
});
