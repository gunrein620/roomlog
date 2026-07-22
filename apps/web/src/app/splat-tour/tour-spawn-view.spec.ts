import assert from "node:assert/strict";
import test from "node:test";
import { isValidSpawnView, resolveTourSpawnView } from "./tour-spawn-view";
import type { SpawnView } from "./tour-types";

const FALLBACK: SpawnView = { position: [0, 1, 0], target: [0, 0, -1] };
const VALID: SpawnView = { position: [1.2, 1.45, -0.5], target: [0.3, 0.4, -2.1] };

test("isValidSpawnView: 유한수 3튜플 position/target이면 유효", () => {
  assert.equal(isValidSpawnView(VALID), true);
});

test("isValidSpawnView: null/undefined는 무효", () => {
  assert.equal(isValidSpawnView(null), false);
  assert.equal(isValidSpawnView(undefined), false);
});

test("isValidSpawnView: position/target 필드 누락은 무효", () => {
  assert.equal(isValidSpawnView({ position: VALID.position }), false);
  assert.equal(isValidSpawnView({}), false);
});

test("isValidSpawnView: 길이가 3이 아닌 배열은 무효", () => {
  assert.equal(isValidSpawnView({ position: [1, 2], target: VALID.target }), false);
  assert.equal(isValidSpawnView({ position: [1, 2, 3, 4], target: VALID.target }), false);
});

test("isValidSpawnView: NaN/Infinity/문자열 성분은 무효", () => {
  assert.equal(isValidSpawnView({ position: [1, Number.NaN, 3], target: VALID.target }), false);
  assert.equal(isValidSpawnView({ position: [1, Number.POSITIVE_INFINITY, 3], target: VALID.target }), false);
  assert.equal(isValidSpawnView({ position: ["1", 2, 3], target: VALID.target }), false);
});

test("resolveTourSpawnView: 유효값은 그대로 통과", () => {
  assert.deepEqual(resolveTourSpawnView(VALID, FALLBACK), VALID);
});

test("resolveTourSpawnView: 없음(null)이면 폴백", () => {
  assert.deepEqual(resolveTourSpawnView(null, FALLBACK), FALLBACK);
});

test("resolveTourSpawnView: 무효값이면 폴백", () => {
  assert.deepEqual(resolveTourSpawnView({ position: [1, 2] }, FALLBACK), FALLBACK);
});
