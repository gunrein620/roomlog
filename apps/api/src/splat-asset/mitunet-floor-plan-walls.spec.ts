import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mitunetToOwnerWalls } from "./mitunet-floor-plan-walls";

// 웹 포팅(apps/web/src/app/floor-plan-3d/room-scene/mitunet-to-walls.spec.ts)과 같은 픽스처·같은
// 기대값을 쓴다 — api는 web 모듈을 import하지 않는 원칙이라 알고리즘을 복제했으니, 두 스펙이 같은
// 입력에 같은 수치를 내는지가 곧 두 포팅이 어긋나지 않았다는 증거다.

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

describe("mitunetToOwnerWalls", () => {
  it("프로덕션 폴리곤 형태에서 OBB가 약 0.77m×0.19m를 낸다", () => {
    const walls = mitunetToOwnerWalls(testPlan({ millimetersPerPixel: 9.5 }));

    assert.equal(walls.length, 1);
    const [wall] = walls;
    assert.ok(Math.abs(wall.dimensions.width - 0.7695) < 0.01, `width=${wall.dimensions.width}`);
    assert.ok(Math.abs(wall.dimensions.depth - 0.19) < 0.01, `depth=${wall.dimensions.depth}`);
    assert.equal(wall.dimensions.height, 2.4);
  });

  it("yaw 왕복 — wallLocalToWorldXZ로 되돌리면 OBB 모서리와 일치한다", () => {
    const walls = mitunetToOwnerWalls(testPlan({ millimetersPerPixel: 9.5 }));
    assert.equal(walls.length, 1);
    const [wall] = walls;

    const corners = wallFootprintCorners(wall);
    assert.equal(corners.length, 4);

    // 기대 모서리 — 웹 스펙과 동일하게 손으로 재도출(이 폴리곤의 최소면적 OBB는 축정렬 픽셀
    // bbox([221,637]-[302,657])와 우연히 일치한다).
    const metresPerPixel = 0.0095;
    const centerPixelX = (221 + 302) / 2;
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
        (corner) => Math.abs(corner.x - expected.x) < 1e-6 && Math.abs(corner.z - expected.z) < 1e-6
      );
      assert.ok(found, `expected corner ${JSON.stringify(expected)} not found in ${JSON.stringify(corners)}`);
    }
  });

  it("millimetersPerPixel 없으면 8m/최장변 폴백을 쓴다", () => {
    const square = {
      outer: [
        [0, 0],
        [100, 0],
        [100, 10],
        [0, 10]
      ] as [number, number][],
      holes: []
    };
    const walls = mitunetToOwnerWalls(testPlan({ millimetersPerPixel: null, wall: [square] }));

    assert.equal(walls.length, 1);
    // metresPerPixel = 8 / 100 = 0.08 → width = 100 * 0.08 = 8m, depth = 10 * 0.08 = 0.8m
    assert.ok(Math.abs(walls[0].dimensions.width - 8) < 1e-6, `width=${walls[0].dimensions.width}`);
    assert.ok(Math.abs(walls[0].dimensions.depth - 0.8) < 1e-6, `depth=${walls[0].dimensions.depth}`);
  });

  it("유효하지 않은 입력은 빈 배열", () => {
    assert.deepEqual(mitunetToOwnerWalls(null), []);
    assert.deepEqual(mitunetToOwnerWalls({}), []);
    assert.deepEqual(mitunetToOwnerWalls({ schema: "roomlog-mitunet-floor-plan", version: 1 }), []);
  });
});

// floor-plan-match.ts의 wallLocalToWorldXZ와 동일 규약(z = position[2] − localX·sin(ry) +
// localZ·cos(ry))을 그대로 복제 — api는 web 모듈을 import하지 않는 원칙이라 여기서도 로컬 포팅.
function wallFootprintCorners(wall: {
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: { width: number; depth: number };
}): { x: number; z: number }[] {
  const halfWidth = wall.dimensions.width / 2;
  const halfDepth = wall.dimensions.depth / 2;
  const localCorners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];
  const ry = wall.rotation[1];
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return localCorners.map((corner) => ({
    x: wall.position[0] + corner.x * cos + corner.z * sin,
    z: wall.position[2] - corner.x * sin + corner.z * cos
  }));
}
