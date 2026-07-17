import test from "node:test";
import assert from "node:assert/strict";

import { boundsOverlap, layoutDimensionLabels } from "../viewer/measurement-layout.mjs";

const candidate = (id, x, y) => ({
  id,
  anchor: { x, y },
  normal: { x: 0, y: -1 },
  width: 64,
  height: 18,
  angle: 0,
});

test("overlapping labels move to outward deterministic lanes", () => {
  const layout = layoutDimensionLabels([
    candidate("first", 100, 100),
    candidate("second", 110, 100),
  ]);

  assert.deepEqual(layout.map(item => item.id), ["first", "second"]);
  assert.equal(layout[0].offset, 14);
  assert.equal(layout[1].offset, 34);
  assert.equal(boundsOverlap(layout[0].bounds, layout[1].bounds, 2), false);
});

test("reserved room labels push dimensions outward without hiding them", () => {
  const reserved = [{ left: 60, top: 72, right: 140, bottom: 96 }];
  const layout = layoutDimensionLabels([candidate("wall", 100, 100)], reserved);

  assert.equal(layout.length, 1);
  assert.ok(layout[0].offset > 14);
  assert.equal(boundsOverlap(layout[0].bounds, reserved[0], 2), false);
});

test("all input dimensions are returned in input order", () => {
  const input = Array.from({ length: 12 }, (_, index) => candidate(`wall-${index}`, 100, 100));
  const layout = layoutDimensionLabels(input);

  assert.equal(layout.length, input.length);
  assert.deepEqual(layout.map(item => item.id), input.map(item => item.id));
  assert.ok(layout.every((item, index) => item.offset === 14 + index * 20));
});
