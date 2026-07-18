import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomFloorMaterialMap,
  decodeRoomFloorLabels,
  encodeRoomFloorLabels,
  materialForRoomLabel,
} from "../viewer/room-floor-zones.mjs";

function normalizedBox(left, top, right, bottom, width, height) {
  return [
    { x: left / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: bottom / height * 1000 },
    { x: left / width * 1000, y: bottom / height * 1000 },
  ];
}

function rectangle(left, top, right, bottom) {
  return {
    holes: [],
    outer: [[left, top], [right, top], [right, bottom], [left, bottom]],
  };
}

test("maps Korean and English room labels to deterministic floor materials", () => {
  assert.equal(materialForRoomLabel("침실"), "WOOD");
  assert.equal(materialForRoomLabel("거실"), "WOOD");
  assert.equal(materialForRoomLabel("주방/식당"), "KITCHEN_FLOOR");
  assert.equal(materialForRoomLabel("욕실"), "TILE");
  assert.equal(materialForRoomLabel("다용도실"), "TILE");
  assert.equal(materialForRoomLabel("발코니"), "BALCONY_TILE");
  assert.equal(materialForRoomLabel("현관"), "STONE_TILE");
  assert.equal(materialForRoomLabel("Bedroom"), "WOOD");
});

test("round-trips compact room label maps", () => {
  const labels = Uint8Array.from([0, 0, 1, 1, 1, 2, 2, 0]);
  const encoded = encodeRoomFloorLabels(labels, 4, 2);
  assert.equal(encoded.encoding, "rle-u8");
  assert.deepEqual(decodeRoomFloorLabels(encoded), labels);
});

test("partitions floor pixels by room seeds without crossing a sealed doorway", () => {
  const width = 48;
  const height = 24;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const polygons = {
    wall: [rectangle(23, 0, 25, 8), rectangle(23, 16, 25, 24)],
    door: [rectangle(23, 8, 25, 16)],
    window: [],
  };
  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    openings: [],
    polygons,
    rooms: [
      { confidence: 0.98, label: "침실", polygon: normalizedBox(6, 6, 18, 18, width, height) },
      { confidence: 0.97, label: "욕실", polygon: normalizedBox(30, 6, 42, 18, width, height) },
    ],
    sourceRgba,
    width,
  });
  const decoded = decodeRoomFloorLabels(map);

  assert.equal(decoded[12 * width + 12], 1);
  assert.equal(decoded[12 * width + 36], 2);
  assert.equal(decoded[12 * width + 24] > 0, true);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < 23; x += 1) assert.notEqual(decoded[y * width + x], 2);
    for (let x = 26; x < width; x += 1) assert.notEqual(decoded[y * width + x], 1);
  }
});

test("uses one material across one open structural component", () => {
  const width = 36;
  const height = 24;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    polygons: { door: [], wall: [], window: [] },
    rooms: [
      { confidence: 0.98, label: "욕실", polygon: normalizedBox(3, 2, 8, 7, width, height) },
      { confidence: 0.94, label: "거실", polygon: normalizedBox(12, 8, 32, 22, width, height) },
    ],
    sourceRgba,
    width,
  });
  const decoded = decodeRoomFloorLabels(map);

  assert.equal(map.zones.length, 1);
  assert.equal(map.zones[0].label, "거실");
  assert.equal(map.zones[0].material, "WOOD");
  assert.deepEqual(new Set(decoded), new Set([1]));
});

test("keeps an entrance polygon separate inside an open kitchen component", () => {
  const width = 40;
  const height = 24;
  const interiorMask = new Uint8Array(width * height);
  for (let y = 2; y < 22; y += 1) {
    for (let x = 2; x < 38; x += 1) interiorMask[y * width + x] = 1;
  }
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const openings = [
    { id: "front", kind: "door", valid: true, axis: "vertical", center_x: 2, center_y: 12, width: 2, height: 8 },
  ];
  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    openings,
    polygons: { door: [], wall: [], window: [] },
    rooms: [
      { confidence: 0.96, label: "주방/식당", polygon: normalizedBox(2, 2, 38, 22, width, height) },
      { confidence: 0.95, label: "현관", polygon: normalizedBox(2, 8, 10, 16, width, height) },
    ],
    sourceRgba,
    width,
  });
  const decoded = decodeRoomFloorLabels(map);
  const kitchen = map.zones.findIndex((zone) => zone.material === "KITCHEN_FLOOR") + 1;
  const entrance = map.zones.findIndex((zone) => zone.material === "STONE_TILE") + 1;

  assert.ok(kitchen > 0);
  assert.ok(entrance > 0);
  assert.equal(decoded[12 * width + 6], entrance);
  assert.equal(decoded[12 * width + 20], kitchen);
  for (let y = 8; y < 16; y += 1) {
    for (let x = 2; x < 10; x += 1) assert.equal(decoded[y * width + x], entrance);
  }
});

test("adds one door-anchored entrance tile without mutating structural inputs", () => {
  const width = 60;
  const height = 40;
  const interiorMask = new Uint8Array(width * height);
  for (let y = 4; y < 36; y += 1) {
    for (let x = 4; x < 56; x += 1) interiorMask[y * width + x] = 1;
  }
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const openings = [
    { id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 30, center_y: 36, width: 10, height: 2 },
  ];
  const polygons = { door: [], wall: [], window: [] };
  const before = structuredClone({ openings, polygons });

  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    millimetersPerPixel: 100,
    openings,
    polygons,
    rooms: [{ confidence: 0.94, label: "거실/식당", polygon: normalizedBox(4, 4, 56, 36, width, height) }],
    sourceRgba,
    width,
  });

  assert.equal(map.zones.filter((zone) => zone.material === "STONE_TILE").length, 1);
  assert.equal(map.zones.filter((zone) => zone.material !== "STONE_TILE").length, 1);
  assert.deepEqual({ openings, polygons }, before);
});

test("moves a semantic seed out of a small dark fixture enclosure", () => {
  const width = 40;
  const height = 30;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const dark = (x, y) => {
    const offset = (y * width + x) * 4;
    sourceRgba[offset] = 0;
    sourceRgba[offset + 1] = 0;
    sourceRgba[offset + 2] = 0;
  };
  for (let x = 17; x <= 23; x += 1) {
    dark(x, 10);
    dark(x, 16);
  }
  for (let y = 10; y <= 16; y += 1) {
    dark(17, y);
    dark(23, y);
  }

  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    openings: [],
    polygons: { door: [], wall: [], window: [] },
    rooms: [{ confidence: 0.95, label: "다용도실", polygon: normalizedBox(19, 12, 21, 14, width, height) }],
    sourceRgba,
    width,
  });

  assert.equal(map.zones[0].seed[0] < 17 || map.zones[0].seed[0] > 23 || map.zones[0].seed[1] < 10 || map.zones[0].seed[1] > 16, true);
  assert.ok(decodeRoomFloorLabels(map).reduce((sum, value) => sum + Number(value === 1), 0) > 500);
});
