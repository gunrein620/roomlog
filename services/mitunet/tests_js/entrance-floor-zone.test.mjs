import assert from "node:assert/strict";
import test from "node:test";

import { findExteriorDoorCandidates } from "../viewer/entrance-floor-zone.mjs";

function rectangularInterior(width, height, left, top, right, bottom) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

test("finds an exterior door and rejects an internal door", () => {
  const width = 64;
  const height = 48;
  const interiorMask = rectangularInterior(width, height, 8, 6, 56, 42);
  const openings = [
    { id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 32, center_y: 42, width: 12, height: 2 },
    { id: "inside", kind: "door", valid: true, axis: "vertical", center_x: 32, center_y: 24, width: 2, height: 10 },
    { id: "window", kind: "window", valid: true, axis: "horizontal", center_x: 20, center_y: 6, width: 8, height: 2 },
  ];

  const candidates = findExteriorDoorCandidates({ height, interiorMask, openings, width });

  assert.deepEqual(candidates.map(({ opening }) => opening.id), ["front"]);
  assert.deepEqual(candidates[0].inward, { x: 0, y: -1 });
  assert.equal(candidates[0].spanPixels, 12);
});
