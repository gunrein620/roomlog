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
  it("defaults legacy furniture to floor and honours an explicit capability", () => {
    const legacy = furniture();
    const wallOnly = furniture({ placementCapability: "wall" });

    assert.equal(furniturePlacementMode(legacy), "floor");
    assert.equal(canPlaceFurniture(wallOnly, "wall"), true);
    assert.equal(canPlaceFurniture(wallOnly, "surface"), false);
  });

  it("uses permissive size heuristics while keeping obvious large furniture on the floor", () => {
    assert.equal(canPlaceFurniture(furniture({ length: [900, 1000, 300], name: "장식장 소품" }), "surface"), true);
    assert.equal(canPlaceFurniture(furniture({ length: [250, 700, 180], name: "거울" }), "wall"), true);
    assert.equal(canPlaceFurniture(furniture({ length: [900, 700, 700], name: "소파" }), "surface"), false);
    assert.equal(canPlaceFurniture(furniture({ length: [250, 700, 420], name: "거울" }), "wall"), false);
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
