import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import type { MitunetSceneLayout } from "../room-scene/mitunet-geometry";
import {
  WALK_COLLISION_RADIUS_METERS,
  findWalkSpawn,
  isWalkPointClear,
  resolveWalkMovement,
  type WalkCollisionWorld
} from "./walk-collision";
import { createFloorPlanWalkWorld } from "./walk-scene";

const emptyWorld: WalkCollisionWorld = {
  bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
  obstacles: []
};

describe("floor-plan walk collision", () => {
  it("uses the approved visitor radius", () => {
    assert.equal(WALK_COLLISION_RADIUS_METERS, 0.22);
  });

  it("blocks a circle at an axis-aligned wall and allows a doorway gap", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [
        { id: "left", center: { x: -0.75, z: 0 }, halfWidth: 0.75, halfDepth: 0.075, rotationY: 0 },
        { id: "right", center: { x: 0.75, z: 0 }, halfWidth: 0.25, halfDepth: 0.075, rotationY: 0 }
      ]
    };

    assert.equal(isWalkPointClear({ x: -0.8, z: 0.2 }, world), false);
    assert.equal(isWalkPointClear({ x: 0.2, z: 0.25 }, world), true);
  });

  it("blocks a rotated obstacle", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "diagonal", center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 0.1, rotationY: Math.PI / 4 }]
    };

    assert.equal(isWalkPointClear({ x: 0.45, z: 0.45 }, world), false);
    assert.equal(isWalkPointClear({ x: 0.8, z: -0.8 }, world), true);
  });

  it("substeps a long frame so movement cannot tunnel through a thin wall", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "wall", center: { x: 0, z: 0 }, halfWidth: 1.5, halfDepth: 0.05, rotationY: 0 }]
    };

    const next = resolveWalkMovement({ x: 0, z: 1 }, { x: 0, z: -2 }, world);

    assert.ok(next.z > WALK_COLLISION_RADIUS_METERS);
  });

  it("slides along a wall when the combined diagonal step is blocked", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "wall", center: { x: 0, z: 0 }, halfWidth: 2, halfDepth: 0.05, rotationY: 0 }]
    };

    const next = resolveWalkMovement({ x: -0.8, z: 0.5 }, { x: 0.6, z: -0.6 }, world);

    assert.ok(next.x > -0.8);
    assert.ok(next.z > WALK_COLLISION_RADIUS_METERS);
  });

  it("repairs an obstructed preferred spawn deterministically", () => {
    const world: WalkCollisionWorld = {
      bounds: emptyWorld.bounds,
      obstacles: [{ id: "center", center: { x: 0, z: 0 }, halfWidth: 0.3, halfDepth: 0.3, rotationY: 0 }]
    };

    const first = findWalkSpawn({ x: 0, z: 0 }, world);
    const second = findWalkSpawn({ x: 0, z: 0 }, world);

    assert.deepEqual(first, second);
    assert.ok(first);
    assert.equal(isWalkPointClear(first, world), true);
  });
});

describe("floor-plan walk scene adapter", () => {
  it("converts scaled wall and confirmed furniture footprints into obstacles", () => {
    const walls: WheretoputWall3D[] = [{
      id: "wall-1",
      wall_id: "wall-1",
      dimensions: { width: 2, height: 2.4, depth: 0.15 },
      position: [1, 1.2, -1],
      rotation: [0, Math.PI / 2, 0]
    }];
    const furniture: PlacedFurniture[] = [{
      id: "chair-1",
      furniture_id: "chair",
      brand: "test",
      name: "chair",
      color: "gray",
      length: [600, 900, 500],
      price: 0,
      position: [0.5, 0, 0.75],
      rotation: [0, Math.PI / 4, 0],
      scale: 1,
      sizeMm: { width: 600, depth: 500, height: 900 }
    }];

    const world = createFloorPlanWalkWorld(walls, furniture, 2);

    assert.deepEqual(world.obstacles.find((item) => item.id === "wall:wall-1")?.center, { x: 2, z: -2 });
    assert.deepEqual(world.obstacles.find((item) => item.id === "furniture:chair-1")?.center, { x: 1, z: 1.5 });
    assert.equal(world.obstacles.length, 2);
  });

  it("creates a walkable world from MitUNet polygons when legacy walls are empty", () => {
    const layout: MitunetSceneLayout = {
      bounds: { centerX: 0, centerZ: 0, width: 6, depth: 4 },
      hasPhysicalScale: true,
      wall: [
        { outer: [[-3, -2], [3, -2], [3, -1.8], [-3, -1.8]], holes: [] },
        { outer: [[-3, 1.8], [3, 1.8], [3, 2], [-3, 2]], holes: [] },
        { outer: [[-3, -2], [-2.8, -2], [-2.8, 2], [-3, 2]], holes: [] },
        { outer: [[2.8, -2], [3, -2], [3, 2], [2.8, 2]], holes: [] }
      ],
      door: [],
      window: []
    };
    const createWorldWithMitunet = createFloorPlanWalkWorld as (
      walls: readonly WheretoputWall3D[],
      furniture: readonly PlacedFurniture[],
      horizontalScale: number,
      mitunetLayout: MitunetSceneLayout
    ) => WalkCollisionWorld;

    const world = createWorldWithMitunet([], [], 1, layout);
    const mitunetWorld = world as WalkCollisionWorld & { polygonObstacles?: unknown[] };
    const spawn = findWalkSpawn({ x: 0, z: 0 }, world);

    assert.deepEqual(world.bounds, { minX: -3, maxX: 3, minZ: -2, maxZ: 2 });
    assert.equal(mitunetWorld.polygonObstacles?.length, 4);
    assert.equal(isWalkPointClear({ x: 0, z: -1.9 }, world), false);
    assert.ok(spawn);
    assert.equal(isWalkPointClear(spawn, world), true);
  });
});
