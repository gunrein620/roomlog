import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFurnitureDimensions } from "../floor-plan-3d/furniture-placement";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";
import { DEMO_SPLAT_FURNITURE, resolveSplatFurniture } from "./splat-furniture";

describe("splat furniture resolver", () => {
  it("turns furniture off from every URL off spelling", () => {
    const storage = fakeStorage({
      floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
    });

    for (const value of ["0", "off", "false", "no"]) {
      const state = resolveSplatFurniture(`?furniture=${value}`, storage);

      assert.equal(state.source, "url-off");
      assert.deepEqual(state.furnitures, []);
    }
  });

  it("forces the deterministic demo furniture set from the URL", () => {
    const state = resolveSplatFurniture(
      "?furniture=demo",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      })
    );

    assert.equal(state.source, "url-demo");
    assert.deepEqual(state.furnitures, DEMO_SPLAT_FURNITURE);
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["demo-bed", "demo-desk", "demo-chair"]
    );
  });

  it("chooses resident design or draft by savedAt in both directions", () => {
    const newerResident = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 }),
        residentFloorPlanDesign: JSON.stringify({
          furnitures: [testFurniture("resident")],
          lockedFurnitures: [testFurniture("locked")],
          savedAt: 20
        })
      })
    );

    assert.equal(newerResident.source, "resident-design");
    assert.deepEqual(
      newerResident.furnitures.map((furniture) => furniture.id),
      ["locked", "resident"]
    );

    const newerDraft = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 30 }),
        residentFloorPlanDesign: JSON.stringify({
          furnitures: [testFurniture("resident")],
          lockedFurnitures: [testFurniture("locked")],
          savedAt: 20
        })
      })
    );

    assert.equal(newerDraft.source, "floor-plan-draft");
    assert.deepEqual(
      newerDraft.furnitures.map((furniture) => furniture.id),
      ["draft"]
    );
  });

  it("falls back to floorPlanDraft when no newer resident design exists", () => {
    const state = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")] })
      })
    );

    assert.equal(state.source, "floor-plan-draft");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["draft"]
    );
  });

  it("ignores broken JSON without throwing", () => {
    const state = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: "{"
      })
    );

    assert.equal(state.source, "none");
    assert.deepEqual(state.furnitures, []);
  });

  it("filters invalid furniture items and returns none when the chosen source becomes empty", () => {
    const state = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({
          furnitures: [
            testFurniture("valid"),
            { ...testFurniture("bad-scale"), scale: 0 },
            { ...testFurniture("bad-length"), length: [1200, 0, 600] }
          ],
          savedAt: 10
        })
      })
    );

    assert.equal(state.source, "floor-plan-draft");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["valid"]
    );

    const emptyChosenSource = resolveSplatFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({
          furnitures: [{ ...testFurniture("draft"), position: [0, Number.POSITIVE_INFINITY, 0] }],
          savedAt: 30
        }),
        residentFloorPlanDesign: JSON.stringify({
          furnitures: [testFurniture("resident")],
          savedAt: 20
        })
      })
    );

    assert.equal(emptyChosenSource.source, "none");
    assert.deepEqual(emptyChosenSource.furnitures, []);
  });

  it("skips localStorage resolution when storage is null", () => {
    const state = resolveSplatFurniture("", null);

    assert.equal(state.source, "none");
    assert.deepEqual(state.furnitures, []);
  });

  it("keeps the demo set inside the 3x4m room boundary", () => {
    assert.equal(DEMO_SPLAT_FURNITURE.length, 3);

    for (const furniture of DEMO_SPLAT_FURNITURE) {
      const footprint = furnitureFootprint(furniture);
      const [x, y, z] = furniture.position;

      assert.equal(y, furniture.length[1] / 2000);
      assert.ok(x - footprint.halfX >= -1.5);
      assert.ok(x + footprint.halfX <= 1.5);
      assert.ok(z - footprint.halfZ >= -2);
      assert.ok(z + footprint.halfZ <= 2);
    }
  });
});

function fakeStorage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    }
  };
}

function testFurniture(id: string): PlacedFurniture {
  return {
    ...DEMO_SPLAT_FURNITURE[0],
    id,
    name: `테스트 가구 ${id}`,
    position: [0, DEMO_SPLAT_FURNITURE[0].length[1] / 2000, 0],
    rotation: [0, 0, 0],
    scale: 1
  };
}

function furnitureFootprint(furniture: PlacedFurniture): { halfX: number; halfZ: number } {
  const dimensions = getFurnitureDimensions(furniture);
  const angle = furniture.rotation[1] ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = dimensions.width / 2;
  const halfDepth = dimensions.depth / 2;

  return {
    halfX: Math.abs(cos) * halfWidth + Math.abs(sin) * halfDepth,
    halfZ: Math.abs(sin) * halfWidth + Math.abs(cos) * halfDepth
  };
}
