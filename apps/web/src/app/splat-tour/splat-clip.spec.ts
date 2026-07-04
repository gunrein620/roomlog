import assert from "node:assert/strict";
import test from "node:test";

const EPSILON = 1e-9;

test("calculates a room clip box around the floor-center origin", async () => {
  const { DEFAULT_SPLAT_CLIP_MARGIN_METERS, createRoomClipBox } = await loadClipModule();
  const box = createRoomClipBox();

  assertApproxEqual(box.min.x, -1.5 - DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assertApproxEqual(box.max.x, 1.5 + DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assertApproxEqual(box.min.y, -DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assertApproxEqual(box.max.y, 2.4 + DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assertApproxEqual(box.min.z, -2 - DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assertApproxEqual(box.max.z, 2 + DEFAULT_SPLAT_CLIP_MARGIN_METERS);
});

test("treats clip box boundaries as inside", async () => {
  const { createRoomClipBox, isInsideClipBox } = await loadClipModule();
  const box = createRoomClipBox(0.1);

  assert.equal(isInsideClipBox({ x: box.min.x, y: box.min.y, z: box.min.z }, box), true);
  assert.equal(isInsideClipBox({ x: box.max.x, y: box.max.y, z: box.max.z }, box), true);
});

test("rejects points just outside any clip axis", async () => {
  const { createRoomClipBox, isInsideClipBox } = await loadClipModule();
  const box = createRoomClipBox(0);

  assert.equal(isInsideClipBox({ x: -1.5001, y: 1, z: 0 }, box), false);
  assert.equal(isInsideClipBox({ x: 0, y: 2.4001, z: 0 }, box), false);
  assert.equal(isInsideClipBox({ x: 0, y: 1, z: 2.0001 }, box), false);
});

test("falls back to the default margin for invalid values", async () => {
  const { DEFAULT_SPLAT_CLIP_MARGIN_METERS, normalizeSplatClipMargin } = await loadClipModule();

  assert.equal(normalizeSplatClipMargin(-0.1), DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assert.equal(normalizeSplatClipMargin(Number.NaN), DEFAULT_SPLAT_CLIP_MARGIN_METERS);
  assert.equal(normalizeSplatClipMargin(0), 0);
});

function loadClipModule() {
  return import(new URL("./splat-clip.ts", import.meta.url).href);
}

function assertApproxEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} is not within ${EPSILON} of ${expected}`);
}
