import assert from "node:assert/strict";
import test from "node:test";

import { buildEntranceFloorOverride, findExteriorDoorCandidates } from "../viewer/entrance-floor-zone.mjs";

function rectangularInterior(width, height, left, top, right, bottom) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

function normalizedBox(left, top, right, bottom, width, height) {
  return [
    { x: left / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: bottom / height * 1000 },
    { x: left / width * 1000, y: bottom / height * 1000 },
  ];
}

function entranceFixture() {
  const width = 80;
  const height = 60;
  const interiorMask = rectangularInterior(width, height, 8, 6, 72, 52);
  const labels = new Uint8Array(width * height);
  for (let index = 0; index < labels.length; index += 1) labels[index] = interiorMask[index] ? 1 : 0;
  return {
    height,
    interiorMask,
    labels,
    openings: [{ id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 40, center_y: 52, width: 12, height: 2 }],
    permanentSolid: new Uint8Array(width * height),
    width,
  };
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

test("uses a validated entrance polygon next to the front door", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    rooms: [{ confidence: 0.92, label: "현관", polygon: normalizedBox(32, 38, 48, 52, fixture.width, fixture.height) }],
  });
  assert.ok(result);
  assert.equal(result.label, "현관");
  assert.equal(result.baseLabel, 1);
  assert.ok(result.pixels.length > 80);
  assert.ok(result.pixels.every((index) => fixture.labels[index] === 1));
});

test("creates a conservative entrance zone when the drawing has no room names", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] });
  assert.ok(result);
  assert.equal(result.label, "현관");
  assert.ok(result.pixels.length > 80);
  assert.ok(result.pixels.length < fixture.interiorMask.reduce((sum, value) => sum + value, 0) * 0.15);
});

test("returns null when no exterior entrance can be proven", () => {
  const fixture = entranceFixture();
  fixture.openings[0] = { ...fixture.openings[0], center_y: 30 };
  assert.equal(buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] }), null);
});
