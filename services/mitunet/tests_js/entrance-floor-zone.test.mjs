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

test("keeps rejected doors excluded even when confidence is high", () => {
  const width = 64;
  const height = 48;
  const interiorMask = rectangularInterior(width, height, 8, 6, 56, 42);
  const opening = {
    axis: "vertical",
    center_x: 16,
    center_y: 24,
    confidence: 0.9,
    height: 12,
    id: "front-rejected",
    kind: "door",
    mask_polygon: [[8, 18], [24, 18], [24, 30], [8, 30]],
    valid: false,
    width: 16,
  };

  assert.deepEqual(findExteriorDoorCandidates({ height, interiorMask, openings: [opening], width }), []);
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

test("uses a typed entrance polygon when its visible label is generic", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    rooms: [{
      confidence: 0.92,
      label: "space 1",
      polygon: normalizedBox(32, 38, 48, 52, fixture.width, fixture.height),
      roomType: "ENTRY",
    }],
  });
  assert.ok(result);
  assert.equal(result.confidence, 0.92);
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

test("uses the entrance-side connected label component for the 15 percent cap", () => {
  const fixture = entranceFixture();
  fixture.labels.fill(0);
  for (let y = 32; y < 52; y += 1) {
    for (let x = 28; x < 52; x += 1) fixture.labels[y * fixture.width + x] = 1;
  }
  for (let y = 6; y < 31; y += 1) {
    for (let x = 8; x < 72; x += 1) fixture.labels[y * fixture.width + x] = 1;
  }
  assert.equal(buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] }), null);
});

test("rejects label-free fallback when multiple safe exterior doors remain", () => {
  const fixture = entranceFixture();
  fixture.openings.push({ id: "rear", kind: "door", valid: true, axis: "horizontal", center_x: 40, center_y: 6, width: 12, height: 2 });
  assert.equal(buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] }), null);
});

test("rejects a fallback zone that overlaps an AI balcony polygon", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    rooms: [{ confidence: 0.95, label: "발코니", polygon: normalizedBox(32, 36, 48, 47, fixture.width, fixture.height) }],
  });
  assert.equal(result, null);
});

test("rejects a fallback zone that overlaps a typed balcony polygon with a generic label", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    rooms: [{
      confidence: 0.95,
      label: "space 1",
      polygon: normalizedBox(32, 36, 48, 47, fixture.width, fixture.height),
      roomType: "BALCONY",
    }],
  });
  assert.equal(result, null);
});

test("uses the standard door scale to limit uncalibrated semantic entrance area", () => {
  const width = 400;
  const height = 200;
  const interiorMask = rectangularInterior(width, height, 10, 10, 390, 190);
  const labels = new Uint8Array(width * height);
  for (let index = 0; index < labels.length; index += 1) labels[index] = interiorMask[index] ? 1 : 0;
  const result = buildEntranceFloorOverride({
    height,
    interiorMask,
    labels,
    openings: [{ id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 200, center_y: 190, width: 12, height: 2 }],
    permanentSolid: new Uint8Array(width * height),
    rooms: [{ confidence: 0.95, label: "현관", polygon: normalizedBox(150, 89, 250, 189, width, height) }],
    width,
  });
  assert.ok(result);
  const estimatedScale = 900 / 12;
  assert.ok(result.pixels.length * estimatedScale * estimatedScale <= 6_000_000);
  assert.ok(result.pixels.length < 1_000);
});

test("paints a confident entrance polygon even when no exterior door was detected", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    openings: [],
    rooms: [{
      confidence: 0.86,
      label: "현관",
      polygon: normalizedBox(10, 6, 24, 20, fixture.width, fixture.height),
      roomType: "ENTRY",
    }],
  });

  assert.ok(result);
  assert.equal(result.label, "현관");
  assert.ok(result.pixels.length > 0);
  assert.ok(result.pixels.every((index) => {
    const x = index % fixture.width;
    const y = Math.floor(index / fixture.width);
    return x >= 10 && x < 24 && y >= 6 && y < 20;
  }));
});
