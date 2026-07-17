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

// --- 실제 재구성 splat 오판 방어(오프셋 바닥·천장 밀도 역전) ---

test("추정: 천장이 훨씬 촘촘해도 (비율 문턱 아래) 절대 문턱으로 바닥을 고른다", () => {
  // 976k gaussian 방 실측 재현: 천장 슬래브가 바닥의 5배로 촘촘해 바닥 빈이 최빈의 40% 아래.
  // 옛 상대 문턱 단독이면 천장을 바닥으로 latch → floorY 양수. 절대 문턱으로 바닥이 스스로 자격.
  const samples = [...repeat(-1.075, 500), ...repeat(1.225, 2500)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -1.075) <= HALF_BIN + 1e-9);
  assert.ok(estimate.floorY < 0, "천장(양수)이 아니라 바닥(음수)을 골라야 한다");
});

test("추정: 촬영 높이 오프셋으로 바닥이 옛 ±1.5m 창 밖(-1.775m)이어도 넓힌 창에서 찾는다", () => {
  // 옛 창[-1.5,1.5]이면 바닥이 빠져 천장(0.725)만 보여 오판. 넓힌 창[-3,3]에서 바닥이 잡힌다.
  const samples = [...repeat(-1.775, 800), ...repeat(0.725, 2000)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -1.775) <= HALF_BIN + 1e-9);
  assert.ok(estimate.floorY < -1.5, "옛 창 밖에 있던 실제 바닥을 골라야 한다");
});

test("추정: 오프셋 바닥 아래 소수 플로터는 절대·상대 두 문턱 모두에서 걸러진다", () => {
  const samples = [...repeat(-2.475, 40), ...repeat(-1.025, 1500), ...repeat(1.325, 1800)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -1.025) <= HALF_BIN + 1e-9);
});

test("추정: 오프셋 상황에서 가구 상판이 바닥보다 촘촘해도 더 낮은 바닥을 고른다", () => {
  const samples = [...repeat(-1.025, 500), ...repeat(-0.225, 1400), ...repeat(1.225, 900)];

  const estimate = estimateSplatFloorY(samples);

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.floorY - -1.025) <= HALF_BIN + 1e-9);
});
