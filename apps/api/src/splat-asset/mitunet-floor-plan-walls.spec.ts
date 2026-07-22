import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mitunetToWallSegments } from "./mitunet-floor-plan-walls";
import type { WallSegment } from "../roomlog/services/floor-plan-match";

// 실픽스처(apps/web/public/dev-fixtures/*.json, gitignore라 CI에서 못 읽는다)의 위상을 합성으로
// 재현한 픽스처들이다: mitunet-56829a98.json류(폴리곤 1개 + hole)가 링, 옛 프로덕션 폴리곤
// (아래 THIN_STRIP_OUTER)이 얇은 띠, millimetersPerPixel 없는 3개가 미보정 폴백 케이스다.

const EPSILON = 1e-9;

// 부동소수 곱셈(예: (2-5)*0.1)은 딱 떨어지는 소수로 안 남을 수 있어(-0.30000000000000004 등) 근사 비교.
function assertPointClose(actual: [number, number], expected: [number, number]) {
  assert.ok(Math.abs(actual[0] - expected[0]) < EPSILON, `x: ${actual[0]} vs ${expected[0]}`);
  assert.ok(Math.abs(actual[1] - expected[1]) < EPSILON, `y: ${actual[1]} vs ${expected[1]}`);
}
function assertSegmentsClose(actual: WallSegment[], expected: { start: [number, number]; end: [number, number] }[]) {
  assert.equal(actual.length, expected.length);
  actual.forEach((segment, index) => {
    assertPointClose(segment.start, expected[index].start);
    assertPointClose(segment.end, expected[index].end);
  });
}

function testPlan(overrides: {
  millimetersPerPixel?: number | null;
  wall?: { outer: [number, number][]; holes: [number, number][][] }[];
  door?: { outer: [number, number][]; holes: [number, number][][] }[];
  window?: { outer: [number, number][]; holes: [number, number][][] }[];
}) {
  return {
    schema: "roomlog-mitunet-floor-plan",
    version: 1,
    name: "테스트 도면",
    canvasSize: [800, 800],
    contentRect: [0, 0, 800, 800],
    millimetersPerPixel: overrides.millimetersPerPixel ?? null,
    polygons: {
      wall: overrides.wall ?? [],
      door: overrides.door ?? [],
      window: overrides.window ?? []
    }
  };
}

describe("mitunetToWallSegments — 링 위상(outer + holes)", () => {
  it("outer·holes 둘 다 세그먼트로 낸다 — 벽 안팎 면 모두가 실제 벽면", () => {
    // 10×8 사각 외곽선(outer) + 6×4 사각 구멍(holes) — mitunet-56829a98.json류(폴리곤 1개 + hole)의
    // 단순화. millimetersPerPixel=100 → metresPerPixel=0.1로 손계산이 쉽게.
    const outer: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]];
    const hole: [number, number][] = [[2, 2], [8, 2], [8, 6], [2, 6]];
    const result = mitunetToWallSegments(
      testPlan({ millimetersPerPixel: 100, wall: [{ outer, holes: [hole] }] })
    );

    // 원점 = outer 픽셀 bbox 중심([0,10]×[0,8] → (5,4)). holes는 원점 계산에서 제외된다.
    assert.equal(result.segments.length, 8, "outer 4변 + hole 4변");

    assertSegmentsClose(result.segments.slice(0, 4), [
      { start: [-0.5, -0.4], end: [0.5, -0.4] },
      { start: [0.5, -0.4], end: [0.5, 0.4] },
      { start: [0.5, 0.4], end: [-0.5, 0.4] },
      { start: [-0.5, 0.4], end: [-0.5, -0.4] }
    ]);

    assertSegmentsClose(result.segments.slice(4), [
      { start: [-0.3, -0.2], end: [0.3, -0.2] },
      { start: [0.3, -0.2], end: [0.3, 0.2] },
      { start: [0.3, 0.2], end: [-0.3, 0.2] },
      { start: [-0.3, 0.2], end: [-0.3, -0.2] }
    ]);
  });
});

describe("mitunetToWallSegments — 얇은 띠(outer만)", () => {
  // 실제 프로덕션 매물(listing 938decc8)에서 나온 벽 폴리곤 좌표 그대로 — 벽 발자국 외곽선(중심선 아님).
  const THIN_STRIP_OUTER: [number, number][] = [
    [221, 656],
    [298, 657],
    [298, 639],
    [302, 637],
    [221, 638]
  ];

  it("폐다각형 세그먼트를 낸다(점 개수만큼, 마지막이 첫 점과 닫힘)", () => {
    const result = mitunetToWallSegments(
      testPlan({ millimetersPerPixel: 9.5, wall: [{ outer: THIN_STRIP_OUTER, holes: [] }] })
    );

    assert.equal(result.segments.length, THIN_STRIP_OUTER.length);
    const last = result.segments[result.segments.length - 1];
    assert.deepEqual(last.end, result.segments[0].start, "마지막 세그먼트가 첫 점으로 닫혀야 함");
  });
});

describe("mitunetToWallSegments — millimetersPerPixel 미보정 폴백", () => {
  it("8m / 최장변 폴백을 web(mitunet-geometry.ts)과 동일하게 쓴다", () => {
    const square: [number, number][] = [[0, 0], [100, 0], [100, 10], [0, 10]];
    const result = mitunetToWallSegments(testPlan({ millimetersPerPixel: null, wall: [{ outer: square, holes: [] }] }));

    // metresPerPixel = 8 / 100 = 0.08 → 원점(50,5) 기준 첫 변 (0,0)-(100,0) → (-4,-0.4)-(4,-0.4)
    assert.equal(result.segments.length, 4);
    assertSegmentsClose(result.segments.slice(0, 1), [{ start: [-4, -0.4], end: [4, -0.4] }]);
  });
});

describe("mitunetToWallSegments — web(createMitunetSceneLayout)과 동일 입력·동일 스케일", () => {
  // apps/web/src/app/floor-plan-3d/room-scene/mitunet-geometry.spec.ts의
  // "uses millimetres-per-pixel calibration when available" 테스트와 완전히 같은
  // wall/door/window 폴리곤·millimetersPerPixel(5)를 쓴다 — 그 테스트가
  // layout.door[0].outer[0] = [-0.25, -0.6]을 검증하므로, 여기서 같은 입력에 같은 원점·스케일로
  // 같은 문 중심점이 나오면 두 포팅이 어긋나지 않았다는 증거다.
  const wall = { outer: [[200, 100], [600, 100], [600, 140], [200, 140]] as [number, number][], holes: [] };
  const door = { outer: [[350, 100], [450, 100], [450, 140], [350, 140]] as [number, number][], holes: [] };
  const windowPolygon = { outer: [[300, 300], [500, 300], [500, 340], [300, 340]] as [number, number][], holes: [] };

  it("벽 세그먼트 4개 + 문/창 개구부 중심이 web과 같은 좌표계로 나온다", () => {
    const result = mitunetToWallSegments(
      testPlan({ millimetersPerPixel: 5, wall: [wall], door: [door], window: [windowPolygon] })
    );

    // 원점 = 모든 outer 점(200~600, 100~340) bbox 중심 (400, 220), metresPerPixel = 5/1000 = 0.005.
    assertSegmentsClose(result.segments, [
      { start: [-1, -0.6], end: [1, -0.6] },
      { start: [1, -0.6], end: [1, -0.4] },
      { start: [1, -0.4], end: [-1, -0.4] },
      { start: [-1, -0.4], end: [-1, -0.6] }
    ]);

    assert.equal(result.openings?.length, 2);
    assert.equal(result.openings?.[0].kind, "door");
    assertPointClose(result.openings![0].center, [0, -0.5]);
    assert.equal(result.openings?.[1].kind, "window");
    assertPointClose(result.openings![1].center, [0, 0.5]);
  });
});

describe("mitunetToWallSegments — 유효하지 않은 입력", () => {
  it("빈 세그먼트를 돌려준다", () => {
    assert.deepEqual(mitunetToWallSegments(null), { segments: [] });
    assert.deepEqual(mitunetToWallSegments({}), { segments: [] });
    assert.deepEqual(mitunetToWallSegments({ schema: "roomlog-mitunet-floor-plan", version: 1 }), { segments: [] });
  });
});
