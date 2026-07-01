import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("./src/app/page.tsx", import.meta.url), "utf8");
const floorPlanPagePath = new URL("./src/app/floor-plan-3d/page.tsx", import.meta.url);
const floorPlanPageSource = existsSync(floorPlanPagePath) ? readFileSync(floorPlanPagePath, "utf8") : "";
const floorPlanEditorPath = new URL("./src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx", import.meta.url);
const floorPlanEditorSource = existsSync(floorPlanEditorPath) ? readFileSync(floorPlanEditorPath, "utf8") : "";
const floorPlanRouteSource = `${floorPlanPageSource}\n${floorPlanEditorSource}`;

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

test("adds a Roomlog floor plan editor core based on the 123123 wall editor workflow", () => {
  assert.match(floorPlanPageSource, /RoomlogFloorPlanEditor/);
  assert.equal(existsSync(floorPlanEditorPath), true, "Roomlog 도면 편집기 컴포넌트가 있어야 합니다.");

  for (const label of ["use client", "onPointerDown", "onPointerMove", "onPointerUp", "createWall", "findNearestWall"]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("offers a 3D conversion mode for the floor plan editor", () => {
  for (const label of ["3D 변환", "2D 편집", "convertWallsTo3D", "floor-plan-3d-preview"]) {
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

test("floor plan editor model converts 2D walls into 3D wall panels", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsTo3D([wall], { height: 96, depth: 8 });

  assert.equal(converted.wallPanels.length, 1);
  assert.equal(converted.wallPanels[0].id, "front");
  assert.equal(converted.wallPanels[0].height, 96);
  assert.equal(converted.wallPanels[0].depth, 8);
  assert.match(converted.wallPanels[0].path, /^M /);
  assert.equal(converted.floor.path.includes("L"), true);
});
