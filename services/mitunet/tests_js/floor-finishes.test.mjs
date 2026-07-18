import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildFloorFinishRgba,
  buildInteriorMask,
  maskContains,
  worldToMaskPixel,
} from "../viewer/floor-finishes.mjs";
import { encodeRoomFloorLabels } from "../viewer/room-floor-zones.mjs";

const rectangle = (x1, y1, x2, y2) => ({
  outer: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
  holes: [],
});

const readDemo = key => JSON.parse(
  readFileSync(new URL(`../viewer/demos/${key}.json`, import.meta.url), "utf8"),
);

function polygonBoundsArea(polygons) {
  const points = Object.values(polygons).flatMap(items => (
    items.flatMap(polygon => polygon.outer)
  ));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

test("closed walls classify the room center as interior and the border as exterior", () => {
  const polygons = {
    wall: [
      rectangle(2, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [],
    window: [],
  };
  const mask = buildInteriorMask(polygons, 16, 16);
  assert.equal(maskContains(mask, 16, 16, 8, 8), true);
  assert.equal(maskContains(mask, 16, 16, 0, 0), false);
});

test("door polygons temporarily close openings during interior classification", () => {
  const polygons = {
    wall: [
      rectangle(2, 2, 7, 3),
      rectangle(9, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [rectangle(7, 2, 9, 3)],
    window: [],
  };
  const mask = buildInteriorMask(polygons, 16, 16);
  assert.equal(maskContains(mask, 16, 16, 8, 8), true);
  assert.equal(maskContains(mask, 16, 16, 8, 2), true);
});

test("a rejected door still seals its doorway so the room behind stays interior", () => {
  // The doorway must be wider than the seam-closing radius, or the gap would be
  // sealed regardless of the door and the test would prove nothing.
  const polygons = {
    wall: [
      rectangle(2, 2, 5, 3),
      rectangle(11, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [],
    window: [],
  };
  const doorway = {
    kind: "door",
    valid: false,
    confidence: 0.94,
    mask_polygon: [[5, 2], [11, 2], [11, 3], [5, 3]],
  };

  assert.equal(
    maskContains(buildInteriorMask(polygons, 16, 16), 16, 16, 8, 8),
    false,
    "without the rejected door the flood fill leaks through the doorway",
  );
  assert.equal(
    maskContains(buildInteriorMask(polygons, 16, 16, [doorway]), 16, 16, 8, 8),
    true,
  );
});

test("a low-confidence rejected door is not allowed to wall off open space", () => {
  const polygons = {
    wall: [
      rectangle(2, 2, 5, 3),
      rectangle(11, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [],
    window: [],
  };
  const spurious = {
    kind: "door",
    valid: false,
    confidence: 0.31,
    mask_polygon: [[5, 2], [11, 2], [11, 3], [5, 3]],
  };

  assert.equal(
    maskContains(buildInteriorMask(polygons, 16, 16, [spurious]), 16, 16, 8, 8),
    false,
  );
});

test("real demo geometry retains a plausible enclosed floor area", () => {
  for (const key of ["1191", "4068", "3676"]) {
    const demo = readDemo(key);
    const [width, height] = demo.canvas_size;
    const mask = buildInteriorMask(demo.polygons, width, height);
    const interiorPixels = mask.reduce((sum, value) => sum + value, 0);
    const boundsArea = polygonBoundsArea(demo.polygons);

    assert.ok(
      interiorPixels > boundsArea * 0.6,
      `${key}: expected enclosed floor above 60% of polygon bounds, got ${interiorPixels}/${boundsArea}`,
    );
  }
});

test("real demo doorway remains continuous floor after sealing the flood barrier", () => {
  const demo = readDemo("1191");
  const [width, height] = demo.canvas_size;
  const mask = buildInteriorMask(demo.polygons, width, height);

  for (const [x, y] of [[212, 258], [212, 265], [212, 272]]) {
    assert.equal(maskContains(mask, width, height, x, y), true, `${x},${y}`);
  }
});

test("world coordinates map back to the plan mask", () => {
  assert.deepEqual(
    worldToMaskPixel({ x: 1, z: 2 }, { scale: 0.5, cx: 10, cy: 20 }),
    { x: 12, y: 24 },
  );
});

test("renders deterministic material colors and preserves a legacy wood fallback", () => {
  const width = 6;
  const height = 2;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const labels = Uint8Array.from([
    1, 1, 2, 2, 3, 0,
    1, 1, 2, 2, 3, 0,
  ]);
  const floorMaterials = {
    ...encodeRoomFloorLabels(labels, width, height),
    zones: [
      { material: "WOOD" },
      { material: "TILE" },
      { material: "BALCONY_TILE" },
    ],
  };

  const zoned = buildFloorFinishRgba({ floorMaterials, height, interiorMask, width });
  const pixel = index => [...zoned.slice(index * 4, index * 4 + 4)];
  assert.notDeepEqual(pixel(0).slice(0, 3), pixel(2).slice(0, 3));
  assert.notDeepEqual(pixel(2).slice(0, 3), pixel(4).slice(0, 3));
  assert.equal(pixel(5)[3], 0);

  const legacy = buildFloorFinishRgba({ height, interiorMask, width });
  assert.equal(legacy[3], 255);
  assert.deepEqual([...legacy.slice(0, 4)], [...buildFloorFinishRgba({ height, interiorMask, width }).slice(0, 4)]);
});

test("renders deterministic concrete distinct from wood and entry stone", () => {
  const width = 8;
  const height = 4;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const labels = new Uint8Array(width * height).fill(1);
  const concreteMap = {
    ...encodeRoomFloorLabels(labels, width, height),
    zones: [{ material: "CONCRETE" }],
  };
  const stoneMap = {
    ...encodeRoomFloorLabels(labels, width, height),
    zones: [{ material: "STONE_TILE" }],
  };
  const first = buildFloorFinishRgba({ floorMaterials: concreteMap, height, interiorMask, width });
  const second = buildFloorFinishRgba({ floorMaterials: concreteMap, height, interiorMask, width });
  const stone = buildFloorFinishRgba({ floorMaterials: stoneMap, height, interiorMask, width });
  const wood = buildFloorFinishRgba({ height, interiorMask, width });

  assert.deepEqual(first, second);
  assert.equal(first[3], 255);
  assert.notDeepEqual(first, stone);
  assert.notDeepEqual(first, wood);
});

test("renders previously saved kitchen floor zones as wood", () => {
  const width = 8;
  const height = 4;
  const interiorMask = new Uint8Array(width * height).fill(1);
  const floorMaterials = {
    ...encodeRoomFloorLabels(new Uint8Array(width * height).fill(1), width, height),
    zones: [{ material: "KITCHEN_FLOOR" }],
  };

  assert.deepEqual(
    buildFloorFinishRgba({ floorMaterials, height, interiorMask, width }),
    buildFloorFinishRgba({ height, interiorMask, width }),
  );
});

test("keeps rooms interior when an undetected boundary door leaks the outside flood", () => {
  const width = 100;
  const height = 100;
  const wall = (left, top, right, bottom) => ({
    outer: [[left, top], [right, top], [right, bottom], [left, bottom]],
    holes: [],
  });
  const polygons = {
    wall: [
      wall(0, 0, 100, 4),
      wall(0, 96, 44, 100),
      wall(56, 96, 100, 100),
      wall(0, 0, 4, 100),
      wall(96, 0, 100, 100),
    ],
    door: [],
    window: [],
  };
  // A detected door elsewhere gives the sealer its scale; the boundary gap at
  // x 44-56 has no detection at all, mirroring a missed main entrance door.
  const openings = [
    { id: "detected", kind: "door", valid: true, axis: "horizontal", center_x: 20, center_y: 50, width: 12, height: 3 },
  ];

  const mask = buildInteriorMask(polygons, width, height, openings);

  assert.equal(maskContains(mask, width, height, 50, 50), true);
  assert.equal(maskContains(mask, width, height, 20, 20), true);
});
