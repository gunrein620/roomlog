import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedFurniture } from "../room-model/types";
import {
  canPlaceFurniture,
  furnitureBaseY,
  furniturePlacementMode,
  hasAttachedFurniture,
  moveAttachedFurniture,
  resolveFurniturePlacement,
  rotateFurnitureForPlacement
} from "./surface-placement";

function furniture(overrides: Partial<PlacedFurniture> = {}): PlacedFurniture {
  return {
    brand: "RoomLog",
    color: "natural",
    furniture_id: "test-item",
    id: "test-item-1",
    length: [400, 400, 300],
    name: "소품",
    position: [0, 0, 0],
    price: 0,
    rotation: [0, 0, 0],
    scale: 1,
    ...overrides
  };
}

describe("automatic furniture surface placement", () => {
  it("defaults legacy furniture to floor placement mode", () => {
    assert.equal(furniturePlacementMode(furniture()), "floor");
  });

  it("allows any furniture on walls and surfaces (배치 자유화)", () => {
    // 품목·크기·capability 게이트 폐지 — 소파도 벽에, 깊은 가구도 위에 올릴 수 있다.
    assert.equal(canPlaceFurniture(furniture({ length: [900, 700, 700], name: "소파" }), "surface"), true);
    assert.equal(canPlaceFurniture(furniture({ length: [900, 700, 700], name: "소파" }), "wall"), true);
    assert.equal(canPlaceFurniture(furniture({ length: [250, 700, 420], name: "거울" }), "wall"), true);
    assert.equal(canPlaceFurniture(furniture({ placementCapability: "wall" }), "surface"), true);
  });

  it("places floor furniture and records a floor attachment", () => {
    const draft = furniture({ position: [2, 0, 2] });
    const result = resolveFurniturePlacement({
      draft,
      hit: { kind: "floor", point: { x: 1.25, y: 0, z: -0.75 } },
      placed: [],
      walls: []
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.attachment, { mode: "floor" });
    assert.deepEqual(result.furniture.position, [1.25, 0, -0.75]);
  });

  it("snaps a small item inside a floor support and stores the relationship", () => {
    const table = furniture({
      category: "테이블·책상",
      id: "table",
      length: [1200, 750, 700],
      name: "테이블",
      position: [0, 0, 0]
    });
    const result = resolveFurniturePlacement({
      draft: furniture({ id: "decor", length: [400, 300, 300] }),
      hit: { kind: "furniture", furnitureId: table.id, point: { x: 0.58, y: 0.75, z: 0 }, supportTopY: 0.75 },
      placed: [table],
      walls: []
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.attachment, { mode: "surface", supportFurnitureId: "table" });
    assert.equal(furnitureBaseY(result.furniture), 0.754);
    assert.ok(result.furniture.position[0] < 0.58);
  });

  it("snaps an oversized item to the support centre instead of rejecting it", () => {
    const stool = furniture({
      id: "stool",
      length: [400, 450, 400],
      name: "스툴",
      position: [2, 0, 2]
    });
    const result = resolveFurniturePlacement({
      // 받침(스툴)보다 큰 수납장 — 거부하지 않고 받침 중앙 위에 올린다.
      draft: furniture({ id: "cabinet", length: [800, 700, 600], name: "수납장" }),
      hit: { kind: "furniture", furnitureId: stool.id, point: { x: 2.19, y: 0.45, z: 1.87 }, supportTopY: 0.45 },
      placed: [stool],
      walls: []
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.attachment, { mode: "surface", supportFurnitureId: "stool" });
    assert.equal(result.furniture.position[0], 2);
    assert.equal(result.furniture.position[2], 2);
  });

  it("rejects second-level stacking and keeps the draft transform", () => {
    const attachedSupport = furniture({
      category: "수납",
      id: "attached",
      length: [800, 500, 500],
      placement: { mode: "surface", supportFurnitureId: "table" },
      position: [1, 0.75, 1]
    });
    const draft = furniture({ id: "decor", position: [4, 0, 4] });
    const result = resolveFurniturePlacement({
      draft,
      hit: { kind: "furniture", furnitureId: attachedSupport.id, point: { x: 1, y: 1.25, z: 1 }, supportTopY: 1.25 },
      placed: [attachedSupport],
      walls: []
    });

    assert.equal(result.valid, false);
    assert.deepEqual(result.furniture.position, draft.position);
  });

  it("aligns and offsets a shallow item from a wall normal", () => {
    const result = resolveFurniturePlacement({
      draft: furniture({ id: "mirror", length: [600, 900, 200], name: "거울" }),
      hit: {
        kind: "wall",
        normal: { x: 0, y: 0, z: 1 },
        point: { x: 1, y: 1.2, z: 2 },
        wallId: "wall-a",
        wallMaxY: 2.4,
        wallMinY: 0
      },
      placed: [],
      walls: []
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.attachment, { mode: "wall", wallId: "wall-a" });
    assert.equal(result.furniture.position[2], 2.102);
    assert.equal(furnitureBaseY(result.furniture), 0.75);
  });

  it("rotates floor items around Y and wall items around their wall normal", () => {
    const floor = rotateFurnitureForPlacement(furniture(), -1);
    const wall = rotateFurnitureForPlacement(furniture({ placement: { mode: "wall", wallId: "wall-a" } }), 1);

    assert.equal(floor.rotation[1], -Math.PI / 2);
    assert.equal(wall.rotation[2], Math.PI / 2);
  });

  it("snaps quarter turns to the absolute 90-degree grid after fine rotation", () => {
    // 섬세 회전으로 13도쯤 틀어진 상태 — 90도 버튼은 상대 가산(103도)이 아니라 절대 그리드로 맞춘다.
    const thirteenDegrees = (13 * Math.PI) / 180;
    const right = rotateFurnitureForPlacement(furniture({ rotation: [0, thirteenDegrees, 0] }), 1);
    const left = rotateFurnitureForPlacement(furniture({ rotation: [0, thirteenDegrees, 0] }), -1);

    assert.ok(Math.abs(right.rotation[1] - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(left.rotation[1]) < 1e-9);

    // 이미 그리드 위(90도)면 한 칸씩 이동한다.
    const onGrid = rotateFurnitureForPlacement(furniture({ rotation: [0, Math.PI / 2, 0] }), 1);
    assert.ok(Math.abs(onGrid.rotation[1] - Math.PI) < 1e-9);
  });

  it("moves direct children with a translated and rotated support", () => {
    const before = furniture({ id: "table", position: [0, 0, 0] });
    const after = furniture({ id: "table", position: [2, 0, 3], rotation: [0, Math.PI / 2, 0] });
    const child = furniture({
      id: "child",
      placement: { mode: "surface", supportFurnitureId: "table" },
      position: [1, 0.5, 0]
    });
    const unrelated = furniture({ id: "other", position: [9, 0, 9] });

    const moved = moveAttachedFurniture({ afterSupport: after, beforeSupport: before, furniture: [child, unrelated] });

    assert.deepEqual(moved[0].position, [2, 0.5, 4]);
    assert.equal(moved[0].rotation[1], Math.PI / 2);
    assert.deepEqual(moved[1], unrelated);
    assert.equal(hasAttachedFurniture("table", moved), true);
  });
});
