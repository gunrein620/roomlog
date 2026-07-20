import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomLogCompletion,
  readRoomLogContext,
  sendRoomLogCompletion,
} from "../viewer/roomlog-integration.mjs";

const locationLike = {
  search: "?integration=roomlog&returnOrigin=http%3A%2F%2Flocalhost%3A3000&requestId=req-123",
};

const plan = {
  canvas_size: [1024, 1024],
  content_rect: [0, 0, 1024, 1024],
  input_image_b64: "must-not-leave-editor",
  calibration: { millimetersPerPixel: 4.25 },
  polygons: {
    wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
    door: [],
    window: [],
  },
};

test("accepts an allowlisted RoomLog return origin", () => {
  assert.deepEqual(readRoomLogContext(locationLike, ["http://localhost:3000"]), {
    requestId: "req-123",
    returnOrigin: "http://localhost:3000",
  });
});

test("rejects an unlisted return origin", () => {
  assert.equal(readRoomLogContext(locationLike, ["https://roomlog.example"]), null);
});

test("requires a non-empty request id", () => {
  assert.equal(
    readRoomLogContext(
      { search: "?integration=roomlog&returnOrigin=http%3A%2F%2Flocalhost%3A3000" },
      ["http://localhost:3000"],
    ),
    null,
  );
});

test("builds a minimal versioned completion message", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(context, plan, "home.png");

  assert.equal(message.type, "roomlog.floor-plan.completed");
  assert.equal(message.schema, "roomlog-mitunet-floor-plan");
  assert.equal(message.version, 1);
  assert.equal(message.requestId, "req-123");
  assert.equal(message.payload.name, "home.png");
  assert.equal(message.payload.millimetersPerPixel, 4.25);
  assert.equal("input_image_b64" in message.payload, false);
});

test("rejects a plan without wall polygons", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  assert.throws(
    () => buildRoomLogCompletion(context, { ...plan, polygons: { wall: [], door: [], window: [] } }),
    /rendered wall plan/i,
  );
});

test("stores the completed plan under its request-scoped key and returns in the same tab", () => {
  const entries = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      setItem(key, value) {
        entries.set(key, value);
      },
    },
    location: { href: "" },
  };
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);

  try {
    const message = sendRoomLogCompletion(context, plan, "home.png");

    assert.equal(message.requestId, "req-123");
    assert.equal(
      globalThis.window.location.href,
      "http://localhost:3000/?flow=listing&floorPlanRequestId=req-123#my-page",
    );
    const stored = JSON.parse(entries.get("roomlogListingFloorPlan3D:req-123"));
    assert.equal(stored.name, "home.png");
    assert.equal(typeof stored.savedAt, "number");
    assert.deepEqual(stored.walls3D, []);
    assert.deepEqual(stored.furnitures, []);
    assert.deepEqual(stored.mitunet, message.payload);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("rejects a missing RoomLog context before accessing browser storage", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} }, location: { href: "" } };

  try {
    assert.throws(
      () => sendRoomLogCompletion(null, plan, "home.png"),
      /integration is not active/i,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("completion message carries optional furniture placements", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(context, plan, "home.png", [{
    id: "chair-1",
    relativePath: "chair/ikea-oak-chair-60478070.glb",
    position: [1, 0.006, -2],
    rotationY: Math.PI / 2,
    sizeMm: { width: 500, height: 800, depth: 520 },
  }]);
  const furniture = message.payload.furnitures[0];

  assert.deepEqual({ ...furniture, color: undefined }, {
    id: "chair-1",
    furniture_id: "glb-dataset-chair/ikea-oak-chair-60478070.glb",
    name: "Oak Chair",
    category: "chair",
    brand: "",
    color: undefined,
    price: 0,
    source: "furniture-glb-dataset",
    modelUrl: "/floor-plan-3d/furniture-assets/chair/ikea-oak-chair-60478070.glb",
    length: [500, 800, 520],
    position: [1, 0.006, -2],
    rotation: [0, Math.PI / 2, 0],
    scale: 1,
    sizeMm: { width: 500, height: 800, depth: 520 },
  });
  assert.match(furniture.color, /^#[0-9a-f]{6}$/i);
});

test("uncalibrated completion scales furniture with the viewer wall-height ratio", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(
    context,
    { ...plan, calibration: null },
    "home.png",
    [{
      id: "chair-1",
      relativePath: "chair/oak-chair.glb",
      position: [1, 0.006, -2],
      rotationY: 0,
      sizeMm: { width: 500, height: 800, depth: 520 },
    }],
  );

  assert.equal(message.payload.furnitures[0].scale, 0.55 / 2.7);
  assert.deepEqual(message.payload.furnitures[0].sizeMm, { width: 500, height: 800, depth: 520 });
});

test("legacy completion calls keep an empty RoomLog furniture array", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(context, plan, "home.png");

  assert.deepEqual(message.payload.furnitures, []);
});

test("completion message preserves optional room floor materials without sharing state", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
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
  const message = buildRoomLogCompletion(
    context,
    { ...plan, floor_materials: floorMaterials },
    "home.png",
  );

  assert.deepEqual(message.payload.floorMaterials, floorMaterials);
  assert.notEqual(message.payload.floorMaterials, floorMaterials);
  assert.notEqual(message.payload.floorMaterials.zones, floorMaterials.zones);
});

test("rejects unsafe or non-GLB furniture paths", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const base = {
    id: "chair-1",
    position: [0, 0, 0],
    rotationY: 0,
    sizeMm: { width: 500, height: 800, depth: 520 },
  };

  for (const relativePath of [
    "../chair.glb",
    "chair/../../secret.glb",
    "chair/%2e%2e/secret.glb",
    "/chair/oak.glb",
    "chair\\oak.glb",
    "chair/oak.obj",
  ]) {
    assert.throws(
      () => buildRoomLogCompletion(context, plan, "home.png", [{ ...base, relativePath }]),
      /invalid furniture/i,
    );
  }
});

test("rejects non-finite transforms and non-positive furniture dimensions", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const base = {
    id: "chair-1",
    relativePath: "chair/oak-chair.glb",
    position: [0, 0, 0],
    rotationY: 0,
    sizeMm: { width: 500, height: 800, depth: 520 },
  };

  for (const furniture of [
    { ...base, position: [0, Number.NaN, 0] },
    { ...base, rotationY: Number.POSITIVE_INFINITY },
    { ...base, sizeMm: { ...base.sizeMm, width: 0 } },
    { ...base, sizeMm: { ...base.sizeMm, depth: -1 } },
  ]) {
    assert.throws(
      () => buildRoomLogCompletion(context, plan, "home.png", [furniture]),
      /invalid furniture/i,
    );
  }
});
