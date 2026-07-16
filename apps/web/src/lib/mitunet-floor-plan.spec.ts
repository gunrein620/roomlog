import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomlogMitunetEditorPath,
  parseMitunetProjectJson,
} from "./mitunet-floor-plan";

const polygons = {
  wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
  door: [],
  window: [],
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
