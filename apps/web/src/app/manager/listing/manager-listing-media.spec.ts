import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MANAGER_LISTING_PHOTOS,
  MANAGER_LISTING_FLOOR_PLAN_STORAGE_KEY,
  mergeManagerListingPhotos,
  parseManagerListingFloorPlan,
  readManagerListingFloorPlanSnapshot,
} from "./manager-listing-media";

const imageFile = (name: string) => new File(["image"], name, { type: "image/jpeg" });
const wall = {
  id: "wall-1",
  wall_id: 1,
  dimensions: { width: 3, height: 2.4, depth: 0.15 },
  position: [0, 1.2, 0],
  rotation: [0, 0, 0],
};

test("keeps existing photos and appends newly selected image files", () => {
  const result = mergeManagerListingPhotos(["/old-1.jpg"], [imageFile("new-1.jpg")]);

  assert.deepEqual(result.existingUrls, ["/old-1.jpg"]);
  assert.equal(result.newFiles.length, 1);
  assert.equal(result.newFiles[0]?.name, "new-1.jpg");
});

test("rejects non-image files and more than ten total photos", () => {
  assert.throws(
    () => mergeManagerListingPhotos([], [new File(["text"], "memo.txt", { type: "text/plain" })]),
    /이미지 파일만/,
  );
  assert.throws(
    () => mergeManagerListingPhotos(Array.from({ length: MAX_MANAGER_LISTING_PHOTOS }, (_, index) => `/old-${index}.jpg`), [imageFile("overflow.jpg")]),
    /10장/,
  );
});

test("normalizes floor plan JSON from walls3D and compatible room3d walls", () => {
  assert.deepEqual(parseManagerListingFloorPlan(JSON.stringify({ walls3D: [wall], name: "도면 A" })), {
    walls3D: [wall],
    furnitures: [],
    name: "도면 A",
  });
  assert.deepEqual(parseManagerListingFloorPlan(JSON.stringify({ room3d: { walls: [wall] } })), {
    walls3D: [wall],
    furnitures: [],
  });
});

test("reads request-scoped floor plan snapshots from local storage", () => {
  const requestId = "manager-listing-123";
  const storage = new Map<string, string>();
  storage.set(`${MANAGER_LISTING_FLOOR_PLAN_STORAGE_KEY}:${requestId}`, JSON.stringify({ walls3D: [wall] }));

  assert.deepEqual(readManagerListingFloorPlanSnapshot({ getItem: (key) => storage.get(key) ?? null }, requestId), {
    walls3D: [wall],
    furnitures: [],
  });
});

test("rejects broken or empty floor plan JSON", () => {
  assert.equal(parseManagerListingFloorPlan("{"), null);
  assert.equal(parseManagerListingFloorPlan(JSON.stringify({ walls3D: [] })), null);
});
