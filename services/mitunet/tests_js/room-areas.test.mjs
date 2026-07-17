import test from "node:test";
import assert from "node:assert/strict";

import { extractRoomAreas, formatRoomArea } from "../viewer/room-areas.mjs";

const fill = (mask, width, left, top, right, bottom, value = 1) => {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * width + x] = value;
  }
};

const twoRoomPlan = () => {
  const width = 60;
  const height = 40;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 4, 4, 56, 6);
  fill(mask, width, 4, 34, 56, 36);
  fill(mask, width, 4, 4, 6, 36);
  fill(mask, width, 54, 4, 56, 36);
  fill(mask, width, 29, 6, 31, 18);
  fill(mask, width, 29, 22, 31, 34);
  return { width, height, mask };
};

test("a valid door footprint separates two enclosed room areas", () => {
  const { width, height, mask } = twoRoomPlan();
  const rooms = extractRoomAreas(mask, [{
    id: "door-1",
    kind: "door",
    axis: "vertical",
    center_x: 30,
    center_y: 20,
    width: 2,
    height: 4,
    valid: true,
  }], width, height, 100, { minimumAreaM2: 1 });

  assert.equal(rooms.length, 2, JSON.stringify(rooms));
  assert.ok(rooms.every(room => room.areaM2 >= 1));
  assert.ok(rooms.every(room => room.anchor.x > 5 && room.anchor.x < 55));
  assert.ok(rooms.every(room => room.anchor.y > 5 && room.anchor.y < 35));
});

test("an invalid door does not invent a room boundary", () => {
  const { width, height, mask } = twoRoomPlan();
  const rooms = extractRoomAreas(mask, [{
    id: "door-invalid",
    kind: "door",
    axis: "vertical",
    center_x: 30,
    center_y: 20,
    width: 2,
    height: 4,
    valid: false,
  }], width, height, 100, { minimumAreaM2: 1 });

  assert.equal(rooms.length, 1);
});

test("regions below one square metre and exterior pixels are excluded", () => {
  const width = 30;
  const height = 30;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 10, 10, 20, 11);
  fill(mask, width, 10, 19, 20, 20);
  fill(mask, width, 10, 10, 11, 20);
  fill(mask, width, 19, 10, 20, 20);

  assert.deepEqual(
    extractRoomAreas(mask, [], width, height, 100, { minimumAreaM2: 1 }),
    [],
  );
});

test("the chosen anchor is always a pixel inside its concave component", () => {
  const width = 40;
  const height = 40;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 5, 5, 35, 7);
  fill(mask, width, 5, 33, 22, 35);
  fill(mask, width, 5, 5, 7, 35);
  fill(mask, width, 20, 18, 22, 35);
  fill(mask, width, 20, 18, 35, 20);
  fill(mask, width, 33, 5, 35, 20);

  const [room] = extractRoomAreas(mask, [], width, height, 100, { minimumAreaM2: 1 });
  assert.ok(room);
  assert.ok(Number.isInteger(room.anchor.x));
  assert.ok(Number.isInteger(room.anchor.y));
});

test("room areas use one decimal square-metre formatting", () => {
  assert.equal(formatRoomArea(10.24), "10.2 m²");
  assert.equal(formatRoomArea(10.25), "10.3 m²");
  assert.equal(formatRoomArea(Number.NaN), "");
  assert.equal(formatRoomArea(-1), "");
});
