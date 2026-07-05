import assert from "node:assert/strict";
import { test } from "node:test";
import { projectPlanToSplat, projectSplatToPlan } from "./transform-project";
import { solveSimilarity } from "./similarity-solve";
import type { SplatTransform } from "./tour-types";

const IDENTITY: SplatTransform = {
  rotationXDegrees: 180,
  rotationYDegrees: 0,
  scaleMultiplier: 1,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0
};

function close(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

test("identity transform maps splat point to itself", () => {
  const p = projectSplatToPlan(IDENTITY, { x: 1.2, y: -0.7 });
  assert.ok(close(p.x, 1.2) && close(p.y, -0.7));
});

test("pure 2x scale doubles the coordinates", () => {
  const t: SplatTransform = { ...IDENTITY, scaleMultiplier: 2 };
  const p = projectSplatToPlan(t, { x: 1, y: 1 });
  assert.ok(close(p.x, 2) && close(p.y, 2));
});

test("90-degree rotation maps +x to +y", () => {
  const t: SplatTransform = { ...IDENTITY, rotationYDegrees: 90 };
  const p = projectSplatToPlan(t, { x: 1, y: 0 });
  assert.ok(close(p.x, 0) && close(p.y, 1));
});

test("plan->splat inverts splat->plan (round trip)", () => {
  const t: SplatTransform = { ...IDENTITY, rotationYDegrees: 37, scaleMultiplier: 1.8, offsetX: 2.5, offsetZ: -1.1 };
  const original = { x: 0.9, y: -1.4 };
  const back = projectPlanToSplat(t, projectSplatToPlan(t, original));
  assert.ok(close(back.x, original.x) && close(back.y, original.y));
});

test("projectSplatToPlan agrees with the solver that produced the transform", () => {
  // 정합 근거 2점쌍으로 solver가 만든 transform은, 같은 splat 점을 plan 점으로 정확히 보내야 한다.
  const pairs = [
    { splat: { x: 0.2, y: 0.5 }, plan: { x: 3.1, y: 1.0 } },
    { splat: { x: -0.4, y: 1.2 }, plan: { x: 2.2, y: 2.7 } }
  ] as const;
  const t = solveSimilarity([pairs[0], pairs[1]]);
  for (const pair of pairs) {
    const projected = projectSplatToPlan(t, pair.splat);
    assert.ok(close(projected.x, pair.plan.x, 1e-6) && close(projected.y, pair.plan.y, 1e-6));
  }
});

test("plan->splat throws when scale is zero", () => {
  assert.throws(() => projectPlanToSplat({ ...IDENTITY, scaleMultiplier: 0 }, { x: 1, y: 1 }), RangeError);
});
