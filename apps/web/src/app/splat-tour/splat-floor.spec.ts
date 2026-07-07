import assert from "node:assert/strict";
import test from "node:test";
import {
  SPLAT_FLOOR_BIN_SIZE_METERS,
  SPLAT_FLOOR_MIN_SAMPLES,
  estimateSplatFloorY
} from "./splat-floor";

const HALF_BIN = SPLAT_FLOOR_BIN_SIZE_METERS / 2;

function repeat(value: number, count: number): number[] {
  return new Array<number>(count).fill(value);
}

test("추정: 벽·가구 잡음 속에서 지배적 바닥 슬래브를 찾는다", () => {
  const walls = Array.from({ length: 500 }, (_, i) => (i / 500) * 1.4); // 0~1.4m 고르게
  const samples = [...repeat(-0.12, 1000), ...repeat(0.6, 300), ...walls];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -0.12) <= HALF_BIN + 1e-9);
});

test("추정: 침대 상판이 바닥보다 촘촘해도 더 낮은 바닥을 고른다", () => {
  const samples = [...repeat(-0.3, 400), ...repeat(0.35, 900)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -0.3) <= HALF_BIN + 1e-9);
});

test("추정: 바닥 아래 소수 플로터는 비율 문턱에서 걸러진다", () => {
  const samples = [...repeat(-1.2, 30), ...repeat(0, 1000)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - 0) <= HALF_BIN + 1e-9);
});

test("추정: 표본이 부족하면 null (탐색 범위 밖 표본은 집계 제외)", () => {
  assert.equal(estimateSplatFloorY(repeat(0, SPLAT_FLOOR_MIN_SAMPLES - 1)), null);
  assert.equal(estimateSplatFloorY([...repeat(9.9, 5000), ...repeat(NaN, 300)]), null);
});
