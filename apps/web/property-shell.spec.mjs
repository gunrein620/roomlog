import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("./src/app/page.tsx", import.meta.url), "utf8");
const floorPlanPagePath = new URL("./src/app/floor-plan-3d/page.tsx", import.meta.url);
const floorPlanPageSource = existsSync(floorPlanPagePath) ? readFileSync(floorPlanPagePath, "utf8") : "";
const floorPlanEditorPath = new URL("./src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx", import.meta.url);
const floorPlanEditorSource = existsSync(floorPlanEditorPath) ? readFileSync(floorPlanEditorPath, "utf8") : "";
const globalsCssSource = readFileSync(new URL("./src/app/globals.css", import.meta.url), "utf8");
const webPackageSource = readFileSync(new URL("./package.json", import.meta.url), "utf8");
const floorPlanRouteSource = `${floorPlanPageSource}\n${floorPlanEditorSource}`;
const floorPlanVisualSource = `${floorPlanRouteSource}\n${globalsCssSource}`;

test("renders a mobile real-estate app shell with search, map list, and listing detail sections", () => {
  for (const label of ["어디에서 방을 찾으세요?", "지도에서 보기", "추천 매물", "매물 상세"]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("promotes the future 3D room tour as a primary listing detail action", () => {
  assert.match(pageSource, /3D\s*(가상\s*)?투어/);
  assert.match(pageSource, /투어\s*예약/);
});

test("offers social-only sign in with a developer shortcut for local entry", () => {
  for (const label of ["카카오", "네이버", "Apple", "Google", "개발용 로그인"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /setActiveRole/);
});

test("borrows mature Zigbang and Dabang product patterns for trust and map search", () => {
  for (const label of ["확인매물", "안심 리포트", "헛걸음 보상", "현장촬영", "그리기", "전체 방", "주변 안전"]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("offers three developer login roles for seekers, tenants, and landlords", () => {
  for (const label of ["일반 집보는 사람", "세입자", "집주인"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /type AppRole/);
  assert.match(pageSource, /setActiveRole\(role\.id\)/);
});

test("shows a landlord my page with property registration fields and media actions", () => {
  for (const label of [
    "집주인 마이페이지",
    "내 집 등록",
    "사진 업로드",
    "3D 도면 만들기",
    "거래유형",
    "보증금",
    "월세",
    "전세",
    "매물 등록하기"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("links the landlord 3D floor plan action to the dedicated creation page", () => {
  assert.match(pageSource, /href="\/floor-plan-3d"/);
  assert.match(pageSource, /3D 도면 만들기/);

  assert.equal(existsSync(floorPlanPagePath), true, "3D 도면 생성 페이지가 있어야 합니다.");

  for (const label of ["3D 도면", "123123", "FloorPlanEditor", "저장 초안"]) {
    assert.match(floorPlanRouteSource, new RegExp(label));
  }
});

test("copies the wheretoput canvas-based 2D drawing workflow", () => {
  assert.match(floorPlanPageSource, /RoomlogFloorPlanEditor/);
  assert.equal(existsSync(floorPlanEditorPath), true, "Roomlog 도면 편집기 컴포넌트가 있어야 합니다.");

  for (const label of [
    "use client",
    "canvasRef",
    "containerRef",
    "handleMouseDown",
    "handleMouseMove",
    "handleMouseUp",
    "handleWheel",
    "partial_eraser",
    "pixelToMmRatio",
    "viewScale",
    "viewOffset",
    "drawCanvas"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("offers a 3D conversion mode for the floor plan editor", () => {
  for (const label of ["3D 변환", "2D 편집", "convertWallsToWheretoputRoom3D", "floor-plan-3d-preview"]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("renders 3D conversion with the wheretoput React Three Fiber stack", () => {
  for (const label of [
    "@react-three/fiber",
    "@react-three/drei",
    "three",
    "Canvas",
    "OrbitControls",
    "boxGeometry",
    "planeGeometry",
    "wheretoput 3D room renderer",
    "#626260",
    "#f3d9a0"
  ]) {
    assert.match(`${floorPlanVisualSource}\n${webPackageSource}`, new RegExp(label));
  }
});

test("imports wheretoput-style upload, extraction, and rotatable 3D simulator controls", () => {
  for (const label of [
    "도면 등록",
    "벽 자동 추출",
    "화면 드래그 회전",
    "배율 조절",
    "handleImageUpload",
    "WallDetector",
    "convertWallsToWheretoputSimulator",
    "convertWallsToWheretoputRoom3D"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("extracts uploaded image walls through a wheretoput-style pixel line pipeline", () => {
  for (const label of [
    "getImageData",
    "detectWallLinesFromImageData",
    "createWallsFromDetectedLines",
    "WallDetector",
    "이미지 벽"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("floor plan editor model snaps, selects, removes, and summarizes walls", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 130, y: 40 }, "w1");

  assert.deepEqual(wall, {
    id: "w1",
    start: { x: 0, y: 0 },
    end: { x: 120, y: 0 }
  });

  assert.equal(model.findNearestWall([wall], { x: 48, y: 5 }, 18)?.id, "w1");
  assert.deepEqual(model.removeWall([wall], "w1"), []);
  assert.deepEqual(model.summarizeWalls([wall]), {
    wallCount: 1,
    approximateMeters: 2.5,
    status: "편집중"
  });
});

test("floor plan editor model converts 2D walls into wheretoput-style 3D wall boxes", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsTo3D([wall], { height: 96, depth: 8 });

  assert.equal(converted.wallPanels.length, 1);
  assert.equal(converted.wallBoxes.length, 1);
  assert.equal(converted.wallBoxes[0].id, "front");
  assert.equal(converted.wallBoxes[0].height, 96);
  assert.equal(converted.wallBoxes[0].depth, 8);
  assert.match(converted.wallBoxes[0].frontPath, /^M /);
  assert.match(converted.wallBoxes[0].topPath, /^M /);
  assert.match(converted.wallBoxes[0].endCapPath, /^M /);
  assert.notEqual(converted.wallBoxes[0].frontPath, converted.wallBoxes[0].topPath);
  assert.equal(converted.floor.path.includes("L"), true);
});

test("floor plan editor model creates wheretoput simulator wall data", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsToWheretoputSimulator([wall], {
    height: 2.5,
    depth: 0.15,
    pixelToMeterRatio: 0.02
  });

  assert.equal(converted.length, 1);
  assert.equal(converted[0].id, "front");
  assert.equal(converted[0].wall_id, "front");
  assert.deepEqual(converted[0].position, [1.2, 1.25, 0]);
  assert.deepEqual(converted[0].rotation, [0, 0, 0]);
  assert.deepEqual(converted[0].dimensions, { width: 2.4, height: 2.5, depth: 0.15 });
});

test("floor plan editor model creates centered wheretoput room 3D wall data", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = [
    { id: "left", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: "right", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } }
  ];
  const converted = model.convertWallsToWheretoputRoom3D(walls, { pixelToMmRatio: 20 });

  assert.equal(converted.length, 2);
  assert.equal(converted[0].material, "wall");
  assert.deepEqual(converted[0].dimensions, { width: 2, height: 2.5, depth: 0.15 });
  assert.equal(converted[0].position[1], 1.25);
  assert.equal(converted[0].original2D.id, "left");
  assert.equal(Math.abs(converted[0].position[0]) > 0 || Math.abs(converted[1].position[2]) > 0, true);
});

test("floor plan editor model can extract starter walls from a registered plan", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = model.createWallsFromRegisteredPlan({ width: 1600, height: 1000, name: "unit.png" });

  assert.equal(walls.length >= 5, true);
  assert.equal(walls[0].id.startsWith("upload-unit-"), true);
  assert.equal(walls.every((wall) => wall.start && wall.end), true);
});

test("floor plan editor model detects wall lines from a binary image mask", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const width = 12;
  const height = 10;
  const mask = Array.from({ length: width * height }, () => false);

  for (let x = 1; x <= 10; x += 1) mask[2 * width + x] = true;
  for (let y = 1; y <= 8; y += 1) mask[y * width + 6] = true;

  const lines = model.detectWallLinesFromMask(mask, { width, height, minRunLength: 6 });

  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.y1 === 2), true);
  assert.equal(lines.some((line) => line.orientation === "vertical" && line.x1 === 6), true);
});

test("floor plan editor model scales detected image lines into editor walls", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = model.createWallsFromDetectedLines(
    [{ x1: 100, y1: 50, x2: 900, y2: 50, orientation: "horizontal" }],
    { width: 1000, height: 500, name: "scan.png" }
  );

  assert.equal(walls.length, 1);
  assert.equal(walls[0].id, "scan-wall-1");
  assert.equal(walls[0].start.y, walls[0].end.y);
  assert.equal(walls[0].end.x > walls[0].start.x, true);
});
