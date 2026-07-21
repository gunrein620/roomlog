import assert from "node:assert/strict";
import test from "node:test";

import {
  ownerFurnitureDraftStorageKey,
  readOwnerFurnitureDraft,
  writeOwnerFurnitureDraft,
  type OwnerFurnitureDraft
} from "./owner-furniture-handoff";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

const draft: OwnerFurnitureDraft = {
  requestId: "request-1",
  savedAt: 123,
  floorPlan: {
    walls3D: [],
    furnitures: [{
      id: "lamp-1",
      furniture_id: "lamp",
      name: "Lamp",
      color: "white",
      length: [300, 500, 120],
      placement: { mode: "wall", wallId: "wall-1" },
      position: [1, 1.2, 2],
      rotation: [0, 0, 0],
      scale: 1
    }],
    mitunet: {
      schema: "roomlog-mitunet-floor-plan",
      version: 1,
      name: "plan",
      canvasSize: [100, 100],
      contentRect: [0, 0, 100, 100],
      millimetersPerPixel: 10,
      polygons: { wall: [], door: [], window: [] },
      surfaceMode: "floor"
    }
  }
};

test("owner furniture draft round-trips by request id", () => {
  const storage = memoryStorage();
  writeOwnerFurnitureDraft(storage, draft);

  assert.equal(ownerFurnitureDraftStorageKey("request-1"), "roomlogOwnerFurnitureDraft:request-1");
  assert.deepEqual(readOwnerFurnitureDraft(storage, "request-1"), draft);
  assert.equal(readOwnerFurnitureDraft(storage, "request-2"), null);
});

test("owner furniture draft rejects a mismatched request id", () => {
  const storage = memoryStorage();
  storage.setItem(ownerFurnitureDraftStorageKey("request-2"), JSON.stringify(draft));
  assert.throws(() => readOwnerFurnitureDraft(storage, "request-2"), /요청 정보/);
});
