import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FurnitureCatalogItem, PlacedFurniture } from "../floor-plan-3d/room-model/types";
import {
  beginTourFurnitureDraft,
  cancelTourFurnitureDraft,
  clampTourFurniturePoint,
  confirmTourFurnitureDraft,
  createTourFurnitureSavePayload,
  deleteTourFurnitureDraft,
  filterTourFurnitureCatalog,
  reopenTourFurnitureDraft,
  rotateTourFurnitureDraft,
  shouldEnableTourFurnitureFloor,
  type TourFurnitureBounds
} from "./splat-furniture-editor";

const bounds: TourFurnitureBounds = {
  minX: -2,
  maxX: 2,
  minZ: -1,
  maxZ: 1
};

const bed: FurnitureCatalogItem = {
  brand: "Roomlog",
  category: "침대",
  color: "#8fb5ff",
  furniture_id: "bed-queen",
  length: [2000, 420, 1500],
  modelUrl: "/furniture-models/bed-queen.glb",
  name: "퀸 침대",
  price: 390000
};

const chair: FurnitureCatalogItem = {
  brand: "Roomlog",
  category: "소파·의자",
  color: "#d6b0ff",
  furniture_id: "chair-basic",
  length: [520, 820, 520],
  modelUrl: "/furniture-models/chair-kevi.glb",
  name: "의자",
  price: 69000
};

describe("splat tour furniture editor", () => {
  it("places a new furniture draft inside the tour bounds", () => {
    const draft = beginTourFurnitureDraft(bed, []);
    const moved = clampTourFurniturePoint(draft.pending!, { x: 9, z: -9 }, bounds);

    assert.deepEqual(moved.position, [2, bed.length[1] / 2000, -1]);
  });

  it("confirms a draft and restores an existing item when the edit is cancelled", () => {
    const original = placedFurniture("original");
    const editing = reopenTourFurnitureDraft({ placed: [original], pending: null, original: null }, original.id);
    const cancelled = cancelTourFurnitureDraft(editing);
    const newDraft = beginTourFurnitureDraft(bed, cancelled.placed);
    const confirmed = confirmTourFurnitureDraft(newDraft);

    assert.deepEqual(cancelled.placed.map((item: PlacedFurniture) => item.id), ["original"]);
    assert.equal(cancelled.pending, null);
    assert.equal(confirmed.placed.length, 2);
    assert.equal(confirmed.pending, null);
  });

  it("rotates the pending furniture in both directions like the 3D renderer", () => {
    const draft = beginTourFurnitureDraft(bed, [placedFurniture("existing")]);
    const rotatedRight = rotateTourFurnitureDraft(draft, 1);
    const rotatedLeft = rotateTourFurnitureDraft(draft, -1);

    assert.equal(rotatedRight.pending?.rotation[1], Number((Math.PI / 2).toFixed(4)));
    assert.equal(rotatedLeft.pending?.rotation[1], Number((-Math.PI / 2).toFixed(4)));
  });

  it("deletes only the currently pending furniture", () => {
    const draft = beginTourFurnitureDraft(bed, [placedFurniture("existing")]);
    const deleted = deleteTourFurnitureDraft(draft);

    assert.deepEqual(deleted.placed.map((item: PlacedFurniture) => item.id), ["existing"]);
    assert.equal(deleted.pending, null);
  });

  it("filters the shared catalog by category and Korean search text", () => {
    assert.deepEqual(
      filterTourFurnitureCatalog([bed, chair], "침대", "퀸").map((item: FurnitureCatalogItem) => item.furniture_id),
      ["bed-queen"]
    );
  });

  it("creates a browser-only save payload and enables the floor only for a pending draft", () => {
    const furniture = placedFurniture("saved");
    const payload = JSON.parse(createTourFurnitureSavePayload([furniture], 10));

    assert.deepEqual(payload, { savedAt: 10, furnitures: [furniture] });
    assert.equal(shouldEnableTourFurnitureFloor(null), false);
    assert.equal(shouldEnableTourFurnitureFloor(furniture), true);
  });
});

function placedFurniture(id: string): PlacedFurniture {
  return {
    ...bed,
    id,
    position: [0, bed.length[1] / 2000, 0],
    rotation: [0, 0, 0],
    scale: 1
  };
}
