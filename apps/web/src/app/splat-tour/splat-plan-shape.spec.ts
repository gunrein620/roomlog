import assert from "node:assert/strict";
import test from "node:test";
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import {
  isNearAnyPlanWall,
  planWallFootprint,
  planWallsFromPayload,
  resolvePlanWalls,
  wallsToPlanBounds
} from "./splat-plan-shape";

const EPSILON = 1e-9;

test("resolvePlanWalls: chooses newer savedAt source and resident on ties", () => {
  const newerResident = resolvePlanWalls(
    fakeStorage({
      floorPlanDraft: storagePayload([testWall("draft")], 10),
      residentFloorPlanDesign: storagePayload([testWall("resident")], 20)
    })
  );

  assert.equal(newerResident?.source, "resident-design");
  assert.deepEqual(newerResident?.walls.map((wall) => wall.id), ["resident"]);

  const newerDraft = resolvePlanWalls(
    fakeStorage({
      floorPlanDraft: storagePayload([testWall("draft")], 30),
      residentFloorPlanDesign: storagePayload([testWall("resident")], 20)
    })
  );

  assert.equal(newerDraft?.source, "floor-plan-draft");
  assert.deepEqual(newerDraft?.walls.map((wall) => wall.id), ["draft"]);

  const tied = resolvePlanWalls(
    fakeStorage({
      floorPlanDraft: storagePayload([testWall("draft")], 40),
      residentFloorPlanDesign: storagePayload([testWall("resident")], 40)
    })
  );

  assert.equal(tied?.source, "resident-design");
  assert.deepEqual(tied?.walls.map((wall) => wall.id), ["resident"]);
});

test("resolvePlanWalls: ignores broken JSON and blocked storage access", () => {
  assert.equal(resolvePlanWalls(fakeStorage({ floorPlanDraft: "{" })), null);
  assert.equal(resolvePlanWalls({ getItem: () => { throw new Error("blocked"); } }), null);
  assert.equal(resolvePlanWalls(null), null);
});

test("resolvePlanWalls: filters invalid walls and returns null when chosen source has no valid walls", () => {
  const valid = testWall("valid");
  const state = resolvePlanWalls(
    fakeStorage({
      floorPlanDraft: storagePayload(
        [
          valid,
          { ...valid, id: "bad-width", dimensions: { width: 0, height: 2.4, depth: 0.15 } },
          { ...valid, id: "bad-position", position: [0, Number.POSITIVE_INFINITY, 0] },
          { ...valid, id: "bad-rotation", rotation: [0, Number.NaN, 0] }
        ],
        10
      )
    })
  );

  assert.equal(state?.source, "floor-plan-draft");
  assert.deepEqual(state?.walls.map((wall) => wall.id), ["valid"]);

  const emptyChosenSource = resolvePlanWalls(
    fakeStorage({
      floorPlanDraft: storagePayload([{ ...valid, dimensions: { width: -1, height: 2.4, depth: 0.15 } }], 30),
      residentFloorPlanDesign: storagePayload([testWall("resident")], 20)
    })
  );

  assert.equal(emptyChosenSource, null);
});

test("wallsToPlanBounds: uses every rotated width-depth footprint corner", () => {
  const bounds = wallsToPlanBounds([
    testWall("rotated", {
      dimensions: { width: 4, height: 2.8, depth: 2 },
      position: [10, 1.4, -5],
      rotation: [0, Math.PI / 4, 0]
    })
  ]);
  const extent = 3 / Math.SQRT2;

  assertApproxEqual(bounds.minX, 10 - extent);
  assertApproxEqual(bounds.maxX, 10 + extent);
  assertApproxEqual(bounds.minZ, -5 - extent);
  assertApproxEqual(bounds.maxZ, -5 + extent);
  assertApproxEqual(bounds.width, extent * 2);
  assertApproxEqual(bounds.depth, extent * 2);
  assertApproxEqual(bounds.height, 2.8);
  assertApproxEqual(bounds.centerX, 10);
  assertApproxEqual(bounds.centerZ, -5);
});

test("wallsToPlanBounds: returns a zero footprint with default height when no walls are valid", () => {
  assert.deepEqual(wallsToPlanBounds([]), {
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
    width: 0,
    depth: 0,
    height: 2.4,
    centerX: 0,
    centerZ: 0
  });
});

test("isNearAnyPlanWall: applies the three.js R_y inverse for a pi/2 wall", () => {
  const wall = testWall("turn", {
    dimensions: { width: 1, height: 2.4, depth: 0.2 },
    rotation: [0, Math.PI / 2, 0]
  });

  assert.equal(isNearAnyPlanWall({ x: 0, y: 1, z: -0.49 }, [wall], 2.4, 0), true);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 1, z: -0.51 }, [wall], 2.4, 0), false);
  assert.equal(isNearAnyPlanWall({ x: 0.09, y: 1, z: -0.49 }, [wall], 2.4, 0), true);
  assert.equal(isNearAnyPlanWall({ x: 0.11, y: 1, z: -0.49 }, [wall], 2.4, 0), false);
});

test("isNearAnyPlanWall: preserves the floor band and ceiling margin y rules", () => {
  const wall = testWall("height");

  assert.equal(isNearAnyPlanWall({ x: 0, y: 0.1, z: 0 }, [wall], 2.4, 0), false);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 0.1001, z: 0 }, [wall], 2.4, 0), true);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 2.6999, z: 0 }, [wall], 2.4, 0), true);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 2.7, z: 0 }, [wall], 2.4, 0), false);
});

test("isNearAnyPlanWall: defaults inset to the splat wall shell inset", () => {
  const wall = testWall("inset", {
    dimensions: { width: 2, height: 2.4, depth: 0.1 }
  });

  assert.equal(isNearAnyPlanWall({ x: 0, y: 1, z: 0.16 }, [wall], 2.4), true);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 1, z: 0.16 }, [wall], 2.4, 0), false);
  assert.equal(isNearAnyPlanWall({ x: 0, y: 1, z: 0.18 }, [wall], 2.4), false);
});

test("planWallsFromPayload: accepts bare array, {walls}, and {room3d:{walls}} shapes", () => {
  const wall = testWall("w1");

  assert.deepEqual(planWallsFromPayload([wall]).map((w) => w.id), ["w1"]);
  assert.deepEqual(planWallsFromPayload({ walls: [wall] }).map((w) => w.id), ["w1"]);
  assert.deepEqual(planWallsFromPayload({ room3d: { walls: [wall] } }).map((w) => w.id), ["w1"]);
});

test("planWallsFromPayload: filters invalid walls and rejects non-plan payloads", () => {
  const valid = testWall("ok");
  const broken = { ...valid, id: "bad", dimensions: { width: 0, height: 2.4, depth: 0.15 } };

  assert.deepEqual(planWallsFromPayload([valid, broken, "junk", null]).map((w) => w.id), ["ok"]);
  assert.deepEqual(planWallsFromPayload("not-json-object"), []);
  assert.deepEqual(planWallsFromPayload(42), []);
  assert.deepEqual(planWallsFromPayload({ unrelated: true }), []);
});

test("planWallFootprint: rotated wall footprint matches wallsToPlanBounds corners", () => {
  const wall = testWall("rot", { position: [1, 1.2, 2], rotation: [0, Math.PI / 2, 0] });
  const corners = planWallFootprint(wall);

  assert.equal(corners.length, 4);
  const bounds = wallsToPlanBounds([wall]);
  for (const corner of corners) {
    assert.ok(corner.x >= bounds.minX - EPSILON && corner.x <= bounds.maxX + EPSILON);
    assert.ok(corner.z >= bounds.minZ - EPSILON && corner.z <= bounds.maxZ + EPSILON);
  }
  // 90° 회전: 길이 2(width)가 z축을 따라 눕는다 → z 스팬 2, x 스팬은 두께 0.15
  assertApproxEqual(bounds.maxZ - bounds.minZ, 2);
  assertApproxEqual(bounds.maxX - bounds.minX, 0.15);
});

function fakeStorage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    }
  };
}

function storagePayload(walls: unknown[], savedAt: number): string {
  return JSON.stringify({ room3d: { walls }, savedAt });
}

function testWall(id: string, overrides: Partial<Omit<WheretoputWall3D, "dimensions">> & {
  dimensions?: Partial<WheretoputWall3D["dimensions"]>;
} = {}): WheretoputWall3D {
  return {
    id,
    wall_id: id,
    material: "wall",
    dimensions: {
      width: 2,
      height: 2.4,
      depth: 0.15,
      ...overrides.dimensions
    },
    position: overrides.position ?? [0, 1.2, 0],
    rotation: overrides.rotation ?? [0, 0, 0]
  };
}

function assertApproxEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} is not within ${EPSILON} of ${expected}`);
}
