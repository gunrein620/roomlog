import assert from "node:assert/strict";
import test from "node:test";
import {
  createWallPanels,
  isWallShellPoint,
  readWallReplaceParam,
  resolveWallReplace
} from "./splat-walls";

const EPSILON = 1e-9;

test("isWallShellPoint: 방 중앙은 벽 셸이 아니다", () => {
  assert.equal(isWallShellPoint({ x: 0, y: 1.2, z: 0 }), false);
});

test("isWallShellPoint: x쪽·z쪽 벽 셸을 숨김 대상으로 판단한다", () => {
  assert.equal(isWallShellPoint({ x: 1.39, y: 1.2, z: 0 }), true);
  assert.equal(isWallShellPoint({ x: -1.39, y: 1.2, z: 0 }), true);
  assert.equal(isWallShellPoint({ x: 0, y: 1.2, z: 1.89 }), true);
  assert.equal(isWallShellPoint({ x: 0, y: 1.2, z: -1.89 }), true);
});

test("isWallShellPoint: 벽 셸이어도 바닥 밴드는 보존한다", () => {
  assert.equal(isWallShellPoint({ x: 1.39, y: 0.1, z: 0 }), false);
  assert.equal(isWallShellPoint({ x: 1.39, y: 0.1001, z: 0 }), true);
});

test("isWallShellPoint: 천장 마진 위는 숨기지 않는다", () => {
  assert.equal(isWallShellPoint({ x: 1.39, y: 2.7, z: 0 }), false);
  assert.equal(isWallShellPoint({ x: 1.39, y: 2.6999, z: 0 }), true);
});

test("isWallShellPoint: 커스텀 room 치수를 반영한다", () => {
  const room = { width: 6, depth: 8, height: 3 };

  assert.equal(isWallShellPoint({ x: 2.5, y: 1.5, z: 0 }, room), false);
  assert.equal(isWallShellPoint({ x: 2.89, y: 1.5, z: 0 }, room), true);
  assert.equal(isWallShellPoint({ x: 0, y: 1.5, z: 3.89 }, room), true);
  assert.equal(isWallShellPoint({ x: 2.89, y: 3.3, z: 0 }, room), false);
});

test("readWallReplaceParam: true 값을 대소문자·공백 무시로 해석한다", () => {
  assert.equal(readWallReplaceParam("?splatWalls=1"), true);
  assert.equal(readWallReplaceParam("?splatWalls=true"), true);
  assert.equal(readWallReplaceParam("?splatWalls=ON"), true);
  assert.equal(readWallReplaceParam("?splatWalls= yes "), true);
});

test("readWallReplaceParam: false 값을 대소문자·공백 무시로 해석한다", () => {
  assert.equal(readWallReplaceParam("?splatWalls=0"), false);
  assert.equal(readWallReplaceParam("?splatWalls=false"), false);
  assert.equal(readWallReplaceParam("?splatWalls=off"), false);
  assert.equal(readWallReplaceParam("?splatWalls=NO"), false);
});

test("readWallReplaceParam: 키가 없거나 모르는 값이면 undefined", () => {
  assert.equal(readWallReplaceParam("?other=1"), undefined);
  assert.equal(readWallReplaceParam("?splatWalls=maybe"), undefined);
  assert.equal(readWallReplaceParam(""), undefined);
});

test("resolveWallReplace: URL 명시값이 fallback을 이긴다", () => {
  assert.equal(resolveWallReplace("?splatWalls=1", false), true);
  assert.equal(resolveWallReplace("?splatWalls=0", true), false);
});

test("resolveWallReplace: URL 명시값이 없으면 fallback을 사용한다", () => {
  assert.equal(resolveWallReplace("?splatWalls=maybe", true), true);
  assert.equal(resolveWallReplace("?other=1", false), false);
});

test("createWallPanels: 기본 room 3×4×2.4의 4개 벽 패널 스펙을 만든다", () => {
  const panels = createWallPanels();

  assert.deepEqual(
    panels.map(({ key }) => key),
    ["north", "south", "west", "east"]
  );
  assert.equal(panels.length, 4);

  assertPanel(panels[0], {
    key: "north",
    position: [0, 1.2, -2],
    rotationY: 0,
    width: 3,
    height: 2.4
  });
  assertPanel(panels[1], {
    key: "south",
    position: [0, 1.2, 2],
    rotationY: Math.PI,
    width: 3,
    height: 2.4
  });
  assertPanel(panels[2], {
    key: "west",
    position: [-1.5, 1.2, 0],
    rotationY: Math.PI / 2,
    width: 4,
    height: 2.4
  });
  assertPanel(panels[3], {
    key: "east",
    position: [1.5, 1.2, 0],
    rotationY: -Math.PI / 2,
    width: 4,
    height: 2.4
  });
});

function assertPanel(
  actual: ReturnType<typeof createWallPanels>[number],
  expected: ReturnType<typeof createWallPanels>[number]
) {
  assert.equal(actual.key, expected.key);
  assertPosition(actual.position, expected.position);
  assertApproxEqual(actual.rotationY, expected.rotationY);
  assertApproxEqual(actual.width, expected.width);
  assertApproxEqual(actual.height, expected.height);
}

function assertPosition(actual: [number, number, number], expected: [number, number, number]) {
  assertApproxEqual(actual[0], expected[0]);
  assertApproxEqual(actual[1], expected[1]);
  assertApproxEqual(actual[2], expected[2]);
}

function assertApproxEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} is not within ${EPSILON} of ${expected}`);
}
