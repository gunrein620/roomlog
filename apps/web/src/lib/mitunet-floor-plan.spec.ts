import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomlogMitunetEditorPath,
  normalizeMitunetPayload,
  parseMitunetProjectJson,
} from "./mitunet-floor-plan";

const polygons = {
  wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
  door: [],
  window: [],
};
const smallPolygons = {
  wall: [{ outer: [[0, 0], [1, 0], [1, 1]], holes: [] }],
  door: [],
  window: [],
};

const floorMaterials = {
  encoding: "rle-u8",
  height: 2,
  labels: "2:1,2:2",
  version: 1,
  width: 2,
  zones: [
    { confidence: 0.98, id: "room-1", label: "침실", material: "WOOD", roomType: "침실", seed: [0, 0] },
    { confidence: 0.97, id: "room-2", label: "욕실", material: "TILE", roomType: "욕실", seed: [1, 1] },
  ],
};

test("builds the RoomLog-internal MitUNet editor path", () => {
  const url = new URL(buildRoomlogMitunetEditorPath("http://localhost:3000", "req-1"), "http://localhost:3000");

  assert.equal(url.pathname, "/floor-plan-3d/mitunet");
  assert.equal(url.searchParams.get("integration"), "roomlog");
  assert.equal(url.searchParams.get("returnOrigin"), "http://localhost:3000");
  assert.equal(url.searchParams.get("requestId"), "req-1");
});

test("imports existing MitUNet project JSON without its source image", () => {
  const parsed = parseMitunetProjectJson({
    schema: "mitunet-floorplan-3d-project",
    version: 1,
    source_name: "home.png",
    plan: {
      canvas_size: [1024, 1024],
      content_rect: [0, 0, 1024, 1024],
      input_image_b64: "ignored",
      calibration: { millimetersPerPixel: 4.25 },
      polygons,
    },
  });

  assert.equal(parsed?.name, "home.png");
  assert.equal(parsed?.millimetersPerPixel, 4.25);
  assert.equal("input_image_b64" in (parsed ?? {}), false);
});

test("rejects non-finite coordinates and plans without walls", () => {
  assert.equal(
    parseMitunetProjectJson({
      schema: "mitunet-floorplan-3d-project",
      version: 1,
      plan: {
        canvas_size: [1024, 1024],
        content_rect: [0, 0, 1024, 1024],
        polygons: {
          wall: [{ outer: [[Number.NaN, 0], [10, 0], [10, 5]], holes: [] }],
          door: [],
          window: [],
        },
      },
    }),
    null,
  );
  assert.equal(
    parseMitunetProjectJson({
      schema: "mitunet-floorplan-3d-project",
      version: 1,
      plan: {
        canvas_size: [1024, 1024],
        content_rect: [0, 0, 1024, 1024],
        polygons: { wall: [], door: [], window: [] },
      },
    }),
    null,
  );
});

test("normalizes missing calibration to null", () => {
  const parsed = parseMitunetProjectJson({
    schema: "mitunet-floorplan-3d-project",
    version: 1,
    plan: {
      canvas_size: [1024, 1024],
      content_rect: [0, 0, 1024, 1024],
      polygons,
    },
  });

  assert.equal(parsed?.millimetersPerPixel, null);
});

test("imports room floor materials from a saved MitUNet project", () => {
  const parsed = parseMitunetProjectJson({
    schema: "mitunet-floorplan-3d-project",
    version: 1,
    source_name: "home.png",
    plan: {
      canvas_size: [2, 2],
      content_rect: [0, 0, 2, 2],
      floor_materials: floorMaterials,
      polygons: smallPolygons,
    },
  });

  assert.deepEqual(parsed?.floorMaterials, floorMaterials);
  assert.notEqual(parsed?.floorMaterials, floorMaterials);
});

test("keeps a saved source-plan surface for the listing preview", () => {
  const parsed = normalizeMitunetPayload({
    canvasSize: [2, 2],
    contentRect: [0, 0, 2, 2],
    polygons: smallPolygons,
    sourceImageB64: "cGxhbg==",
    surfaceMode: "source",
  });

  assert.equal(parsed?.surfaceMode, "source");
  assert.equal(parsed?.sourceImageB64, "cGxhbg==");
});

test("uses the saved source plan in the preview even when an older handoff omitted its mode", () => {
  const parsed = normalizeMitunetPayload({
    canvasSize: [2, 2],
    contentRect: [0, 0, 2, 2],
    polygons: smallPolygons,
    sourceImageB64: "cGxhbg==",
  });

  assert.equal(parsed?.surfaceMode, "source");
  assert.equal(parsed?.sourceImageB64, "cGxhbg==");
});

test("drops invalid optional room floor materials without rejecting the wall plan", () => {
  const parsed = normalizeMitunetPayload({
    canvasSize: [2, 2],
    contentRect: [0, 0, 2, 2],
    floorMaterials: { ...floorMaterials, labels: "3:1" },
    polygons: smallPolygons,
  });

  assert.ok(parsed);
  assert.equal(parsed.floorMaterials, undefined);
});
