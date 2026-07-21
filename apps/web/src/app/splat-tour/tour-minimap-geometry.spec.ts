import assert from "node:assert/strict";
import test from "node:test";
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import type { PlanBounds } from "./splat-plan-shape";
import {
  computeMinimapFit,
  formatMinimapDimensions,
  normalizeWorldToMinimap,
  wallsToMinimapFootprints
} from "./tour-minimap-geometry";

const EPSILON = 1e-9;

function assertApproxEqual(actual: number, expected: number, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function testBounds(overrides: Partial<PlanBounds> = {}): PlanBounds {
  return {
    minX: 0,
    maxX: 4,
    minZ: 0,
    maxZ: 4,
    width: 4,
    depth: 4,
    height: 2.4,
    centerX: 2,
    centerZ: 2,
    ...overrides
  };
}

function testWall(id: string, overrides: Partial<Omit<WheretoputWall3D, "dimensions">> & {
  dimensions?: Partial<WheretoputWall3D["dimensions"]>;
} = {}): WheretoputWall3D {
  return {
    id,
    wall_id: id,
    material: "wall",
    dimensions: {
      width: 2,
      height: 2.4,
      depth: 0.15,
      ...overrides.dimensions
    },
    position: overrides.position ?? [0, 1.2, 0],
    rotation: overrides.rotation ?? [0, 0, 0]
  };
}

test("computeMinimapFit: 정사각형 방은 오프셋 없이 usable 영역을 그대로 채운다", () => {
  const fit = computeMinimapFit({ width: 4, depth: 4 });

  assertApproxEqual(fit!.scale, 88 / 4);
  assertApproxEqual(fit!.offsetX, 0);
  assertApproxEqual(fit!.offsetY, 0);
});

test("computeMinimapFit: 가로가 긴 방은 세로쪽에 중앙정렬 오프셋이 생긴다(비율 보존)", () => {
  const fit = computeMinimapFit({ width: 8, depth: 4 });

  assertApproxEqual(fit!.scale, 88 / 8);
  assertApproxEqual(fit!.offsetX, 0);
  assertApproxEqual(fit!.offsetY, (88 - 4 * (88 / 8)) / 2);
});

test("computeMinimapFit: width/depth가 0 이하면 null(퇴화 bounds)", () => {
  assert.equal(computeMinimapFit({ width: 0, depth: 4 }), null);
  assert.equal(computeMinimapFit({ width: 4, depth: 0 }), null);
});

test("normalizeWorldToMinimap: 직사각형 방의 네 모서리가 여백 6%·중앙정렬 규칙대로 매핑된다", () => {
  const bounds = testBounds({ minX: 0, maxX: 8, minZ: 0, maxZ: 4, width: 8, depth: 4 });

  // 긴 변(가로 8m)은 6~94(usable 88) 전체를 채우고, 짧은 변(세로 4m)은 그 안에서 가운데 정렬된다.
  const scale = 88 / 8;
  const offsetY = (88 - 4 * scale) / 2;

  assertApproxEqual(normalizeWorldToMinimap(0, 0, bounds).x, 6);
  assertApproxEqual(normalizeWorldToMinimap(8, 0, bounds).x, 94);
  assertApproxEqual(normalizeWorldToMinimap(0, 0, bounds).y, 6 + offsetY);
  assertApproxEqual(normalizeWorldToMinimap(0, 4, bounds).y, 6 + offsetY + 4 * scale);
});

test("normalizeWorldToMinimap: 퇴화 bounds는 viewBox 중앙(50,50)으로 접힌다", () => {
  assert.deepEqual(normalizeWorldToMinimap(3, 5, testBounds({ width: 0, depth: 0 })), { x: 50, y: 50 });
});

test("wallsToMinimapFootprints: 직사각형 벽 배열 — 각 폴리곤이 4점이고 bounds 범위 안에 있다", () => {
  const walls = [
    testWall("north", { position: [2, 1.2, 0], dimensions: { width: 4, height: 2.4, depth: 0.15 } }),
    testWall("south", { position: [2, 1.2, 4], dimensions: { width: 4, height: 2.4, depth: 0.15 } }),
    testWall("west", {
      position: [0, 1.2, 2],
      rotation: [0, Math.PI / 2, 0],
      dimensions: { width: 4, height: 2.4, depth: 0.15 }
    }),
    testWall("east", {
      position: [4, 1.2, 2],
      rotation: [0, Math.PI / 2, 0],
      dimensions: { width: 4, height: 2.4, depth: 0.15 }
    })
  ];
  const bounds = testBounds({ minX: -0.075, maxX: 4.075, minZ: -0.075, maxZ: 4.075, width: 4.15, depth: 4.15 });

  const footprints = wallsToMinimapFootprints(walls, bounds);

  assert.equal(footprints.length, 4);
  for (const footprint of footprints) {
    const points = footprint.points.split(" ").map((pair) => pair.split(",").map(Number));
    assert.equal(points.length, 4);
    for (const [x, y] of points) {
      assert.ok(x >= 0 - EPSILON && x <= 100 + EPSILON);
      assert.ok(y >= 0 - EPSILON && y <= 100 + EPSILON);
    }
  }
});

test("wallsToMinimapFootprints: L자 벽 배열도 벽마다 4점 폴리곤을 만든다", () => {
  const walls = [
    testWall("long-leg", { position: [2, 1.2, 0], dimensions: { width: 4, height: 2.4, depth: 0.15 } }),
    testWall("short-leg", {
      position: [4, 1.2, 1],
      rotation: [0, Math.PI / 2, 0],
      dimensions: { width: 2, height: 2.4, depth: 0.15 }
    })
  ];
  const bounds = testBounds({ minX: 0, maxX: 4, minZ: -0.075, maxZ: 2, width: 4, depth: 2.075 });

  const footprints = wallsToMinimapFootprints(walls, bounds);

  assert.deepEqual(
    footprints.map((f) => f.id),
    ["long-leg", "short-leg"]
  );
  for (const footprint of footprints) {
    const points = footprint.points.split(" ").map((pair) => pair.split(",").map(Number));
    assert.equal(points.length, 4);
  }
});

test("wallsToMinimapFootprints: 치수가 유효하지 않은(0 이하) 벽은 걸러진다", () => {
  const walls = [testWall("broken", { dimensions: { width: 0, height: 2.4, depth: 0.15 } })];

  assert.deepEqual(wallsToMinimapFootprints(walls, testBounds()), []);
});

test("formatMinimapDimensions: 소수 1자리로 '가로m x 세로m' 문자열을 만든다", () => {
  assert.equal(formatMinimapDimensions({ width: 3.24, depth: 4.06 }), "3.2m x 4.1m");
});
