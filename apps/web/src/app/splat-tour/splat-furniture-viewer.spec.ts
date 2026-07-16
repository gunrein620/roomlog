import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";
import {
  DEMO_SPLAT_FURNITURE,
  resolveViewerFurniture,
  type ViewerFurnitureAsset
} from "./splat-furniture";

// ?asset= 링크 방문자 가구 소스 우선순위: off > 서버(REGISTERED) > 로컬 > 데모.
describe("viewer furniture priority", () => {
  it("prefers server furniture over local draft when the asset is REGISTERED", () => {
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      }),
      registeredAsset([testFurniture("server")])
    );

    assert.equal(state.source, "asset-server");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["server"]
    );
  });

  it("prefers server furniture over the URL demo set", () => {
    const state = resolveViewerFurniture("?furniture=demo", null, registeredAsset([testFurniture("server")]));

    assert.equal(state.source, "asset-server");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["server"]
    );
  });

  it("respects ?furniture=0 even when the asset ships REGISTERED furniture", () => {
    for (const value of ["0", "off", "false", "no"]) {
      const state = resolveViewerFurniture(
        `?furniture=${value}`,
        fakeStorage({
          floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
        }),
        registeredAsset([testFurniture("server")])
      );

      assert.equal(state.source, "url-off");
      assert.deepEqual(state.furnitures, []);
    }
  });

  it("gates server furniture behind REGISTERED — an UPLOADED asset falls back to local", () => {
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      }),
      { status: "UPLOADED", furnitures: [testFurniture("server")] }
    );

    assert.equal(state.source, "floor-plan-draft");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["draft"]
    );
  });

  it("falls back to local when the asset is null or ships no valid furniture", () => {
    const local = fakeStorage({
      floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
    });

    assert.equal(resolveViewerFurniture("", local, null).source, "floor-plan-draft");
    assert.equal(resolveViewerFurniture("", local, registeredAsset([])).source, "floor-plan-draft");
    assert.equal(
      resolveViewerFurniture("", local, { status: "REGISTERED", furnitures: [{ id: "broken" }] }).source,
      "floor-plan-draft"
    );
    assert.equal(resolveViewerFurniture("", local, { status: "REGISTERED", furnitures: "nope" }).source, "floor-plan-draft");
  });

  it("filters invalid server items and keeps only the valid ones", () => {
    const state = resolveViewerFurniture("", null, {
      status: "REGISTERED",
      furnitures: [testFurniture("ok"), { ...testFurniture("bad"), scale: 0 }]
    });

    assert.equal(state.source, "asset-server");
    assert.deepEqual(
      state.furnitures.map((furniture) => furniture.id),
      ["ok"]
    );
  });

  it("uses the URL demo set when there is neither server nor local furniture", () => {
    const state = resolveViewerFurniture("?furniture=demo", null, null);

    assert.equal(state.source, "url-demo");
    assert.deepEqual(state.furnitures, DEMO_SPLAT_FURNITURE);
  });
});

function registeredAsset(furnitures: unknown[]): ViewerFurnitureAsset {
  return { status: "REGISTERED", furnitures };
}

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
