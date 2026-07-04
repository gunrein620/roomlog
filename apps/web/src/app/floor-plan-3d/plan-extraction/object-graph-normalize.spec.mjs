import assert from "node:assert/strict";
import test from "node:test";
import { normalizeObjectGraph } from "./object-graph-normalize.mjs";

test("ㄱ자 두 벽 끝점 6px 오차를 정션 스냅으로 같은 좌표에 맞춘다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: 10, y: 10 }, end: { x: 100, y: 10 }, thicknessPx: 10 },
        { id: "w2", start: { x: 106, y: 14 }, end: { x: 106, y: 100 }, thicknessPx: 10 }
      ],
      objects: []
    },
    { imageWidth: 200, imageHeight: 200 }
  );

  const horizontal = result.walls.find((wall) => wall.id === "w1");
  const vertical = result.walls.find((wall) => wall.id === "w2");
  assert.deepEqual(horizontal.end, vertical.start);
});

test("벽 중간 문은 2분할하고 문 span 폭만큼 gap을 만들며 10px stub은 제거한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessPx: 12 },
        { id: "w2", start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, thicknessPx: 12 }
      ],
      objects: [
        {
          id: "o1",
          type: "swingDoor",
          center: { x: 55, y: 0 },
          size: { width: 30, height: 8 },
          rotationDeg: 0,
          attachedWallId: "w1",
          spanOnWall: { start: { x: 40, y: 0 }, end: { x: 70, y: 0 } },
          swing: { hinge: "start", opensTowards: { x: 55, y: 24 } },
          confidence: 0.9,
          evidence: "leaf+arc"
        },
        {
          id: "o2",
          type: "slidingDoor",
          center: { x: 25, y: 50 },
          size: { width: 30, height: 8 },
          rotationDeg: 0,
          attachedWallId: "w2",
          spanOnWall: { start: { x: 10, y: 50 }, end: { x: 40, y: 50 } },
          swing: null,
          confidence: 0.8,
          evidence: "parallel panels"
        }
      ]
    },
    { imageWidth: 200, imageHeight: 200 }
  );

  const w1Parts = result.walls.filter((wall) => String(wall.id).startsWith("w1-"));
  assert.equal(w1Parts.length, 2);
  assert.equal(Math.min(...w1Parts.map((wall) => Math.min(wall.start.x, wall.end.x))), 0);
  assert.equal(Math.max(...w1Parts.map((wall) => Math.max(wall.start.x, wall.end.x))), 100);
  const leftPartEnd = Math.max(...w1Parts.map((wall) => Math.max(wall.start.x, wall.end.x)).filter((x) => x <= 40));
  const rightPartStart = Math.min(...w1Parts.map((wall) => Math.min(wall.start.x, wall.end.x)).filter((x) => x >= 70));
  const gapWidth = rightPartStart - leftPartEnd;
  assert.equal(gapWidth, 30);

  const w2Parts = result.walls.filter((wall) => String(wall.id).startsWith("w2-"));
  assert.equal(w2Parts.length, 1);
  assert.deepEqual(w2Parts[0].start, { x: 40, y: 50 });
  assert.deepEqual(w2Parts[0].end, { x: 100, y: 50 });
});

test("문 심볼 박스가 부채꼴 때문에 커도 벽 gap과 객체 크기는 span 폭을 기준으로 한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 150, y: 0 }, thicknessPx: 12 }],
      objects: [
        {
          id: "o1",
          type: "swingDoor",
          center: { x: 75, y: 42 },
          size: { width: 120, height: 120 },
          rotationDeg: 0,
          attachedWallId: "w1",
          spanOnWall: { start: { x: 60, y: 0 }, end: { x: 90, y: 0 } },
          swing: { hinge: "start", opensTowards: { x: 75, y: 80 } },
          confidence: 0.9,
          evidence: "leaf+arc bounding box includes swing area"
        }
      ]
    },
    { imageWidth: 180, imageHeight: 140 }
  );

  const w1Parts = result.walls.filter((wall) => String(wall.id).startsWith("w1-"));
  assert.equal(w1Parts.length, 2);
  const leftPartEnd = Math.max(...w1Parts.map((wall) => Math.max(wall.start.x, wall.end.x)).filter((x) => x <= 60));
  const rightPartStart = Math.min(...w1Parts.map((wall) => Math.min(wall.start.x, wall.end.x)).filter((x) => x >= 90));
  assert.equal(rightPartStart - leftPartEnd, 30);
  assert.deepEqual(result.objects[0].center, { x: 75, y: 0 });
  assert.equal(result.objects[0].size.width, 30);
  assert.ok(result.objects[0].size.height <= 24);
});

test("창문은 벽을 분할하지 않고 attachedWallId를 유지한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessPx: 10 }],
      objects: [
        {
          id: "o1",
          type: "window",
          center: { x: 50, y: 0 },
          size: { width: 30, height: 6 },
          rotationDeg: 0,
          attachedWallId: "w1",
          spanOnWall: { start: { x: 35, y: 0 }, end: { x: 65, y: 0 } },
          swing: null,
          confidence: 0.91,
          evidence: "double frame"
        }
      ]
    },
    { imageWidth: 120, imageHeight: 80 }
  );

  assert.equal(result.walls.length, 1);
  assert.equal(result.walls[0].id, "w1");
  assert.equal(result.objects[0].attachedWallId, "w1");
});

test("창문 spanOnWall은 attachedWall centerline 위로 투영한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [{ id: "w1", start: { x: 0, y: 20 }, end: { x: 100, y: 20 }, thicknessPx: 10 }],
      objects: [
        {
          id: "o1",
          type: "balconyWindow",
          center: { x: 50, y: 23 },
          size: { width: 30, height: 6 },
          rotationDeg: 0,
          attachedWallId: "w1",
          spanOnWall: { start: { x: 35, y: 27 }, end: { x: 65, y: 28 } },
          swing: null,
          confidence: 0.91,
          evidence: "multi-track frame"
        }
      ]
    },
    { imageWidth: 120, imageHeight: 80 }
  );

  assert.equal(result.objects[0].spanOnWall.start.y, 20);
  assert.equal(result.objects[0].spanOnWall.end.y, 20);
});

test("수평에서 5도 기울어진 벽은 축 정렬한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 8.75 }, thicknessPx: 10 }],
      objects: []
    },
    { imageWidth: 200, imageHeight: 100 }
  );

  assert.equal(result.walls[0].start.y, result.walls[0].end.y);
});

test("이미지 밖 좌표는 clamp하고 NaN/알 수 없는 type은 거부하며 warning을 남긴다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: -10, y: 20 }, end: { x: 40, y: 20 }, thicknessPx: 10 },
        { id: "bad-wall", start: { x: Number.NaN, y: 0 }, end: { x: 20, y: 20 }, thicknessPx: 10 }
      ],
      objects: [
        {
          id: "bad-object",
          type: "bed",
          center: { x: 10, y: 10 },
          size: { width: 10, height: 10 },
          rotationDeg: 0,
          attachedWallId: null,
          spanOnWall: null,
          swing: null,
          confidence: 0.2,
          evidence: "furniture"
        }
      ]
    },
    { imageWidth: 100, imageHeight: 80 }
  );

  assert.equal(result.walls.length, 1);
  assert.deepEqual(result.walls[0].start, { x: 0, y: 20 });
  assert.equal(result.objects.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("보정")));
  assert.ok(result.warnings.some((warning) => warning.includes("유효하지 않아 제외")));
  assert.ok(result.warnings.some((warning) => warning.includes("타입을 알 수 없어 제외")));
});

test("중복 벽 id는 suffix를 붙여 유일하게 만든다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 80, y: 0 }, thicknessPx: 10 },
        { id: "w1", start: { x: 0, y: 40 }, end: { x: 80, y: 40 }, thicknessPx: 10 }
      ],
      objects: []
    },
    { imageWidth: 100, imageHeight: 80 }
  );

  assert.deepEqual(result.walls.map((wall) => wall.id), ["w1", "w1-2"]);
});

test("중복 벽 id가 있어도 문 컷은 다른 벽을 오염시키지 않는다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessPx: 10 },
        { id: "w1", start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, thicknessPx: 10 }
      ],
      objects: [
        {
          id: "o1",
          type: "swingDoor",
          center: { x: 50, y: 0 },
          size: { width: 20, height: 8 },
          rotationDeg: 0,
          attachedWallId: "w1",
          spanOnWall: { start: { x: 40, y: 0 }, end: { x: 60, y: 0 } },
          swing: { hinge: "start", opensTowards: { x: 50, y: 24 } },
          confidence: 0.9,
          evidence: "leaf+arc"
        }
      ]
    },
    { imageWidth: 120, imageHeight: 80 }
  );

  assert.equal(result.walls.filter((wall) => String(wall.id).startsWith("w1-")).length, 3);
  assert.ok(result.walls.some((wall) => wall.id === "w1-2" && wall.start.y === 50 && wall.end.y === 50));
});

test("좌표 붕괴 벽을 세로 벽으로 보정하고 그 위 문 span으로 분할한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "w1", start: { x: 1156, y: 102 }, end: { x: 326, y: 326 }, thicknessPx: 12 }
      ],
      objects: [
        {
          id: "o1",
          type: "swingDoor",
          center: { x: 1156, y: 170 },
          size: { width: 12, height: 104 },
          rotationDeg: 90,
          attachedWallId: null,
          spanOnWall: { start: { x: 1156, y: 121 }, end: { x: 1156, y: 225 } },
          swing: { hinge: "start", opensTowards: { x: 1110, y: 170 } },
          confidence: 0.86,
          evidence: "leaf+arc"
        }
      ]
    },
    { imageWidth: 1688, imageHeight: 1114 }
  );

  assert.ok(result.warnings.some((warning) => warning.includes("좌표 붕괴 보정")));
  assert.equal(result.walls.length, 2);
  assert.ok(result.walls.every((wall) => wall.start.x === 1156 && wall.end.x === 1156));
  assert.ok(result.walls.some((wall) => wall.id === "w1-a" && wall.start.y === 102 && wall.end.y === 121));
  assert.ok(result.walls.some((wall) => wall.id === "w1-b" && wall.start.y === 225 && wall.end.y === 326));
});

test("다른 벽 2개를 내부에서 가로지르는 대각선 유령 벽은 제거한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "horizontal", start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, thicknessPx: 10 },
        { id: "vertical", start: { x: 50, y: 0 }, end: { x: 50, y: 100 }, thicknessPx: 10 },
        { id: "ghost", start: { x: 10, y: 10 }, end: { x: 90, y: 90 }, thicknessPx: 10 }
      ],
      objects: []
    },
    { imageWidth: 120, imageHeight: 120 }
  );

  assert.equal(result.walls.some((wall) => wall.id === "ghost"), false);
  assert.ok(result.warnings.some((warning) => warning.includes("대각선 유령 벽")));
});

test("문 center에 더 가까운 직교 벽보다 span과 평행한 벽에 부착한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "parallel", start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, thicknessPx: 10 },
        { id: "closer-vertical", start: { x: 50, y: 35 }, end: { x: 50, y: 65 }, thicknessPx: 10 }
      ],
      objects: [
        {
          id: "o1",
          type: "swingDoor",
          center: { x: 50, y: 50 },
          size: { width: 40, height: 8 },
          rotationDeg: 0,
          attachedWallId: null,
          spanOnWall: { start: { x: 30, y: 50 }, end: { x: 70, y: 50 } },
          swing: { hinge: "start", opensTowards: { x: 50, y: 75 } },
          confidence: 0.9,
          evidence: "leaf+arc"
        }
      ]
    },
    { imageWidth: 120, imageHeight: 120 }
  );

  assert.equal(result.objects[0].attachedWallId, "parallel-a");
  assert.equal(result.walls.some((wall) => wall.id === "closer-vertical"), true);
  assert.equal(result.walls.some((wall) => wall.id === "parallel-a"), true);
  assert.equal(result.walls.some((wall) => wall.id === "parallel-b"), true);
});

test("문 span이 부채꼴/문짝 방향으로 들어와도 attachedWallId의 벽 기준선으로 보정한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        { id: "door-wall", start: { x: 0, y: 50 }, end: { x: 140, y: 50 }, thicknessPx: 12 },
        { id: "near-leaf-line", start: { x: 70, y: 20 }, end: { x: 70, y: 90 }, thicknessPx: 12 }
      ],
      objects: [
        {
          id: "swing-door",
          type: "swingDoor",
          center: { x: 70, y: 50 },
          size: { width: 40, height: 70 },
          rotationDeg: 90,
          attachedWallId: "door-wall",
          spanOnWall: { start: { x: 70, y: 50 }, end: { x: 70, y: 90 } },
          swing: { hinge: "start", opensTowards: { x: 96, y: 78 } },
          confidence: 0.92,
          evidence: "leaf+arc, wall contact edge is horizontal"
        }
      ]
    },
    { imageWidth: 160, imageHeight: 120 }
  );

  const doorObject = result.objects[0];
  assert.equal(doorObject.attachedWallId, "door-wall-a");
  assert.deepEqual(doorObject.spanOnWall, { start: { x: 50, y: 50 }, end: { x: 90, y: 50 } });
  assert.equal(doorObject.rotationDeg, 0);
  assert.equal(result.walls.some((wall) => wall.id === "near-leaf-line"), true);
  assert.ok(result.walls.some((wall) => wall.id === "door-wall-a" && wall.end.x === 50));
  assert.ok(result.walls.some((wall) => wall.id === "door-wall-b" && wall.start.x === 90));
});

test("낮은 각도(14도)로 붕괴된 벽도 보정해 문을 부착한다", () => {
  const result = normalizeObjectGraph(
    {
      walls: [
        // 실측 사례: 세로 벽 (1258,102)->(1258,326)이 (1258,102)->(326,326)으로 붕괴 (off-axis 14도)
        { id: "w_bath_divider", start: { x: 1258, y: 102 }, end: { x: 326, y: 326 }, thicknessPx: 14 }
      ],
      objects: [
        {
          id: "door2",
          type: "swingDoor",
          center: { x: 1258, y: 262 },
          size: { width: 14, height: 85 },
          rotationDeg: 90,
          attachedWallId: "w_bath_divider",
          spanOnWall: { start: { x: 1258, y: 220 }, end: { x: 1258, y: 305 } },
          swing: { hinge: "start", opensTowards: { x: 1230, y: 262 } },
          confidence: 0.68,
          evidence: "leaf+arc"
        }
      ]
    },
    { imageWidth: 1688, imageHeight: 1114 }
  );

  assert.ok(result.warnings.some((warning) => warning.includes("좌표 붕괴 보정")));
  const doorObject = result.objects[0];
  assert.ok(doorObject.attachedWallId, "문이 보정된 벽에 부착되어야 한다");
  const splitParts = result.walls.filter((wall) => String(wall.id).startsWith("w_bath_divider-"));
  assert.ok(splitParts.length >= 1, "보정된 벽이 문 span으로 분할되어야 한다");
  for (const wall of result.walls) assert.equal(wall.start.x === wall.end.x || wall.start.y === wall.end.y, true);
});
