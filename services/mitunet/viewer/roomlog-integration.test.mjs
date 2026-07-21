import assert from "node:assert/strict";
import test from "node:test";

import { buildRoomLogCompletion } from "./roomlog-integration.mjs";

const context = { requestId: "request-1", returnOrigin: "http://localhost:3000" };
const plan = {
  canvas_size: [100, 100],
  content_rect: [0, 0, 100, 100],
  calibration: { millimetersPerPixel: 10 },
  polygons: { wall: [{ outer: [[0, 0], [10, 0], [10, 2], [0, 2]], holes: [] }], door: [], window: [] }
};

function furniture(placement) {
  return {
    id: "furniture-1",
    relativePath: "lighting/lamp.glb",
    position: [1, 1, 2],
    rotationY: 0,
    sizeMm: { width: 300, height: 500, depth: 100 },
    ...(placement ? { placement } : {})
  };
}

test("RoomLog completion preserves surface and wall attachment metadata", () => {
  const surface = buildRoomLogCompletion(context, plan, "plan", [
    furniture({ mode: "surface", supportFurnitureId: "table-1" })
  ]);
  const wall = buildRoomLogCompletion(context, plan, "plan", [
    furniture({ mode: "wall", wallId: "wall-1" })
  ]);

  assert.deepEqual(surface.payload.furnitures[0].placement, { mode: "surface", supportFurnitureId: "table-1" });
  assert.deepEqual(wall.payload.furnitures[0].placement, { mode: "wall", wallId: "wall-1" });
});

test("RoomLog completion leaves legacy furniture attachment absent", () => {
  const message = buildRoomLogCompletion(context, plan, "plan", [furniture()]);
  assert.equal(message.payload.furnitures[0].placement, undefined);
});

test("RoomLog completion rejects incomplete attachment metadata", () => {
  assert.throws(
    () => buildRoomLogCompletion(context, plan, "plan", [furniture({ mode: "surface" })]),
    /supportFurnitureId/
  );
  assert.throws(
    () => buildRoomLogCompletion(context, plan, "plan", [furniture({ mode: "wall" })]),
    /wallId/
  );
});
