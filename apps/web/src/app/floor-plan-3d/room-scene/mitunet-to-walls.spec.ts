import assert from "node:assert/strict";
import test from "node:test";
import { planWallFootprint } from "../../splat-tour/splat-plan-shape";
import { mitunetToPlanWalls } from "./mitunet-to-walls";

const EPSILON = 1e-6;

// 실제 프로덕션 매물(listing 938decc8)에서 나온 벽 폴리곤 좌표 그대로 — 벽 발자국 외곽선(중심선 아님).
const PRODUCTION_WALL_OUTER: [number, number][] = [
  [221, 656],
  [298, 657],
  [298, 639],
  [302, 637],
  [221, 638]
];

function testPlan(overrides: {
  millimetersPerPixel?: number | null;
  wall?: { outer: [number, number][]; holes: [number, number][][] }[];
}) {
  return {
    schema: "roomlog-mitunet-floor-plan",
    version: 1,
    name: "테스트 도면",
    canvasSize: [800, 800],
    contentRect: [0, 0, 800, 800],
    millimetersPerPixel: overrides.millimetersPerPixel ?? null,
    polygons: {
      wall: overrides.wall ?? [{ outer: PRODUCTION_WALL_OUTER, holes: [] }],
      door: [],
      window: []
    }
  };
}

test("mitunetToPlanWalls: 프로덕션 폴리곤 형태에서 OBB가 약 0.77m×0.19m를 낸다", () => {
  // millimetersPerPixel=9.5 → metresPerPixel=0.0095. 폴리곤 자체의 최소면적 OBB는
  // 약 81×20 픽셀(회전된 얇은 띠)이라 0.77m × 0.19m 근방이 나와야 한다.
  const walls = mitunetToPlanWalls(testPlan({ millimetersPerPixel: 9.5 }));

  assert.equal(walls.length, 1);
  const [wall] = walls;
  assert.ok(Math.abs(wall.dimensions.width - 0.7695) < 0.01, `width=${wall.dimensions.width}`);
  assert.ok(Math.abs(wall.dimensions.depth - 0.19) < 0.01, `depth=${wall.dimensions.depth}`);
  assert.equal(wall.dimensions.height, 2.4);
});

test("mitunetToPlanWalls: yaw 왕복 — planWallFootprint로 되돌리면 OBB 모서리와 일치한다", () => {
  const walls = mitunetToPlanWalls(testPlan({ millimetersPerPixel: 9.5 }));
  assert.equal(walls.length, 1);
  const [wall] = walls;

  const corners = planWallFootprint(wall);
  assert.equal(corners.length, 4);

  // 기대 모서리 — 이 폴리곤의 최소면적 OBB는 축정렬 픽셀 bbox([221,637]-[302,657])와 우연히 일치한다
  // (돌출점 (302,637)이 bbox 안쪽 모서리라 회전해도 면적이 줄지 않는다). 같은 픽셀→월드 변환(원점=이
  // 폴리곤 자체의 bbox 중심, 부호 반전 없음)을 mitunet-to-walls.ts와 별개 경로로 손으로 재도출해,
  // 두 계산이 우연히 같은 버그를 공유하지 않는지 확인한다.
  const metresPerPixel = 0.0095;
  const centerPixelX = (221 + 302) / 2; // 폴리곤 자체가 유일한 wall이므로 전체 bbox 중심과 같다
  const centerPixelY = (637 + 657) / 2;
  const expectedPixelCorners: [number, number][] = [
    [221, 637],
    [302, 637],
    [302, 657],
    [221, 657]
  ];
  const expectedWorldCorners = expectedPixelCorners.map(([x, y]) => ({
    x: (x - centerPixelX) * metresPerPixel,
    z: (y - centerPixelY) * metresPerPixel
  }));

  for (const expected of expectedWorldCorners) {
    const found = corners.some(
      (corner) => Math.abs(corner.x - expected.x) < EPSILON && Math.abs(corner.z - expected.z) < EPSILON
    );
    assert.ok(found, `expected corner ${JSON.stringify(expected)} not found in ${JSON.stringify(corners)}`);
  }
});

test("mitunetToPlanWalls: millimetersPerPixel 없으면 8m/최장변 폴백을 쓴다", () => {
  // 정사각형 벽 하나(0,0)-(100,0)-(100,10)-(0,10) — 전체 plan bbox 최장변은 이 벽 자체가 만드는 100px.
  const square = {
    outer: [
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 10]
    ] as [number, number][],
    holes: []
  };
  const walls = mitunetToPlanWalls(testPlan({ millimetersPerPixel: null, wall: [square] }));

  assert.equal(walls.length, 1);
  // metresPerPixel = 8 / 100 = 0.08 → width = 100 * 0.08 = 8m, depth = 10 * 0.08 = 0.8m
  assert.ok(Math.abs(walls[0].dimensions.width - 8) < EPSILON, `width=${walls[0].dimensions.width}`);
  assert.ok(Math.abs(walls[0].dimensions.depth - 0.8) < EPSILON, `depth=${walls[0].dimensions.depth}`);
});

test("mitunetToPlanWalls: 유효하지 않은 입력은 빈 배열", () => {
  assert.deepEqual(mitunetToPlanWalls(null), []);
  assert.deepEqual(mitunetToPlanWalls({}), []);
  assert.deepEqual(mitunetToPlanWalls({ schema: "roomlog-mitunet-floor-plan", version: 1 }), []);
});
