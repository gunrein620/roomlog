import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";
import {
  DEMO_SPLAT_FURNITURE,
  listingTourFurnitureStorageKey,
  resolveViewerFurniture,
  type ViewerFurnitureAsset
} from "./splat-furniture";

// ?asset= 링크 방문자 가구 소스 우선순위: off > 서버(REGISTERED) > 현재 매물 로컬 > 기존 폴백.
describe("viewer furniture priority", () => {
  it("prefers server furniture over local draft when the asset is REGISTERED", () => {
    const listingId = "listing-a";
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 }),
        [listingTourFurnitureStorageKey(listingId)]: JSON.stringify({
          furnitures: [testFurniture("listing-local")],
          savedAt: 20
        })
      }),
      registeredAsset([testFurniture("server")], listingId)
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
      { listingId: "listing-a", status: "UPLOADED", furnitures: [testFurniture("server")] }
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
      resolveViewerFurniture("", local, {
        listingId: "listing-a",
        status: "REGISTERED",
        furnitures: [{ id: "broken" }]
      }).source,
      "floor-plan-draft"
    );
    assert.equal(
      resolveViewerFurniture("", local, {
        listingId: "listing-a",
        status: "REGISTERED",
        furnitures: "nope"
      }).source,
      "floor-plan-draft"
    );
  });

  it("filters invalid server items and keeps only the valid ones", () => {
    const state = resolveViewerFurniture("", null, {
      listingId: "listing-a",
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

  it("reads furniture from the current asset listing key and preserves its source", () => {
    const listingId = "listing-a";
    const objectCaptureFurniture = { ...testFurniture("listing-local"), source: "object-capture" };
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        [listingTourFurnitureStorageKey(listingId)]: JSON.stringify({
          furnitures: [objectCaptureFurniture],
          savedAt: 20
        })
      }),
      registeredAsset([], listingId)
    );

    assert.equal(state.source, "listing-tour");
    assert.deepEqual(state.furnitures.map((furniture) => furniture.id), ["listing-local"]);
    assert.equal(state.furnitures[0]?.source, "object-capture");
  });

  it("does not read furniture saved under another listing key", () => {
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        [listingTourFurnitureStorageKey("listing-a")]: JSON.stringify({
          furnitures: [testFurniture("other-listing")],
          savedAt: 20
        }),
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      }),
      registeredAsset([], "listing-b")
    );

    assert.equal(state.source, "floor-plan-draft");
    assert.deepEqual(state.furnitures.map((furniture) => furniture.id), ["draft"]);
  });

  it("keeps an explicitly empty current-listing save instead of falling back to a draft", () => {
    const listingId = "listing-a";
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        [listingTourFurnitureStorageKey(listingId)]: JSON.stringify({ furnitures: [], savedAt: 20 }),
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      }),
      registeredAsset([], listingId)
    );

    assert.equal(state.source, "none");
    assert.deepEqual(state.furnitures, []);
  });

  it("falls back when the current-listing payload contains no valid furniture", () => {
    const listingId = "listing-a";
    const state = resolveViewerFurniture(
      "",
      fakeStorage({
        [listingTourFurnitureStorageKey(listingId)]: JSON.stringify({ furnitures: [{ id: "broken" }], savedAt: 20 }),
        floorPlanDraft: JSON.stringify({ furnitures: [testFurniture("draft")], savedAt: 10 })
      }),
      registeredAsset([], listingId)
    );

    assert.equal(state.source, "floor-plan-draft");
    assert.deepEqual(state.furnitures.map((furniture) => furniture.id), ["draft"]);
  });
});

function registeredAsset(furnitures: unknown[], listingId: string | null = "listing-a"): ViewerFurnitureAsset {
  return { listingId, status: "REGISTERED", furnitures };
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
