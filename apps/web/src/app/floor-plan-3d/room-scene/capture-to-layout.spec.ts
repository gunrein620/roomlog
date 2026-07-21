import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { captureFloorPlanToSceneLayout } from "./capture-to-layout";

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const extent = (points: [number, number][], axis: 0 | 1) => {
  const values = points.map((point) => point[axis]);
  return round(Math.max(...values) - Math.min(...values));
};

// 실픽스처에서 관찰된 위상을 재현: 두께 0인 벽(전부 그렇다), 축정렬 + 대각선 벽이 섞인
// 닫힌 방(사각형 모서리 하나를 대각선으로 자른 오각형), 문 2개 + 창 1개.
const pentagonRoom = {
  frame: "arkit-metric" as const,
  walls: [
    { start: [0, 0], end: [4, 0], height: 2.34, thickness: 0 }, // W1: x축 평행
    { start: [4, 0], end: [4, 2], height: 2.34, thickness: 0 }, // W2: z축 평행
    { start: [4, 2], end: [3, 3], height: 2.34, thickness: 0 }, // W3: 대각선(모서리 컷)
    { start: [3, 3], end: [0, 3], height: 2.34, thickness: 0 }, // W4: x축 평행
    { start: [0, 3], end: [0, 0], height: 2.34, thickness: 0 } // W5: z축 평행
  ],
  openings: [
    { kind: "door", center: [2, 0], width: 0.9, height: 2.0 }, // W1 위
    { kind: "door", center: [1.5, 3], width: 0.8, height: 2.0 }, // W4 위
    { kind: "window", center: [4, 1], width: 1.0, height: 1.2 } // W2 위
  ]
};

describe("captureFloorPlanToSceneLayout", () => {
  it("returns null for non-object input", () => {
    assert.equal(captureFloorPlanToSceneLayout(null), null);
    assert.equal(captureFloorPlanToSceneLayout("not a plan"), null);
  });

  it("returns null when walls is missing or empty after filtering", () => {
    assert.equal(captureFloorPlanToSceneLayout({}), null);
    assert.equal(captureFloorPlanToSceneLayout({ walls: [] }), null);
    // 시작점=끝점인 퇴화 세그먼트만 있으면 방향을 구할 수 없어 전부 걸러진다.
    assert.equal(
      captureFloorPlanToSceneLayout({ walls: [{ start: [1, 1], end: [1, 1], height: 2, thickness: 0 }] }),
      null
    );
  });

  it("synthesizes a minimum thickness for zero-thickness walls instead of degenerating to a line", () => {
    const layout = captureFloorPlanToSceneLayout(pentagonRoom);
    assert.ok(layout);
    assert.equal(layout!.wall.length, 5);
    // W1은 x축 평행이라 두께는 z방향 폭으로 나타난다.
    assert.equal(extent(layout!.wall[0].outer, 1), 0.1);
  });

  it("preserves the ARKit origin — input coordinates pass through untranslated", () => {
    const layout = captureFloorPlanToSceneLayout(pentagonRoom);
    assert.ok(layout);
    // W1(0,0)->(4,0)은 z방향으로만 반두께(0.05)만큼 밀린다. bbox 중심(2, 1.5)으로
    // 옮겨졌다면 x가 0 근처가 아니라 -2 근처로 나왔을 것이다.
    const [x0, z0] = layout!.wall[0].outer[0];
    assert.equal(round(x0), 0);
    assert.equal(round(Math.abs(z0)), 0.05);
  });

  it("reports the polygon's actual center in bounds, not zero", () => {
    const layout = captureFloorPlanToSceneLayout(pentagonRoom);
    assert.ok(layout);
    assert.equal(layout!.bounds.centerX, 2);
    assert.equal(layout!.bounds.centerZ, 1.5);
    assert.equal(round(layout!.bounds.width), 4.1);
    assert.equal(round(layout!.bounds.depth), 3.1);
    assert.equal(layout!.hasPhysicalScale, true);
  });

  it("orients each opening along its nearest wall", () => {
    const layout = captureFloorPlanToSceneLayout(pentagonRoom);
    assert.ok(layout);
    assert.equal(layout!.door.length, 2);
    assert.equal(layout!.window.length, 1);

    // door 1은 x축 평행 W1 위에 있으니 x로 넓고(=width) z로 얇다(=벽 두께).
    const [door1] = layout!.door;
    assert.equal(extent(door1.outer, 0), 0.9);
    assert.equal(extent(door1.outer, 1), 0.1);

    // window는 z축 평행 W2 위에 있으니 반대로 z가 넓고 x가 얇다.
    const [window1] = layout!.window;
    assert.equal(extent(window1.outer, 1), 1.0);
    assert.equal(extent(window1.outer, 0), 0.1);
  });

  it("drops openings that fail validation instead of producing a bogus polygon", () => {
    const layout = captureFloorPlanToSceneLayout({
      ...pentagonRoom,
      openings: [{ kind: "door", center: [2, 0] }] // width/height 누락
    });
    assert.ok(layout);
    assert.equal(layout!.door.length, 0);
    assert.equal(layout!.window.length, 0);
  });
});

const fixtureDir = join(process.cwd(), "public/dev-fixtures");
const realCaptureFixtures = ["capture-ae71db28.json", "capture-938decc8.json"].filter((file) =>
  existsSync(join(fixtureDir, file))
);

describe("captureFloorPlanToSceneLayout (real fixtures, skipped if not present locally)", () => {
  it(
    "converts every real capture fixture into a non-degenerate layout",
    { skip: realCaptureFixtures.length === 0 ? "public/dev-fixtures 캡처 픽스처가 로컬에 없음(gitignore 대상)" : false },
    () => {
      for (const file of realCaptureFixtures) {
        const json = JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
        const layout = captureFloorPlanToSceneLayout(json);
        assert.ok(layout, `${file} should convert to a layout`);
        assert.ok(layout!.wall.length > 0, `${file} should have wall polygons`);
        assert.equal(layout!.hasPhysicalScale, true);
      }
    }
  );
});
