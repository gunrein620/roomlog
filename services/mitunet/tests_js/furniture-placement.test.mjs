import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneFurniturePlacements,
  createFurniturePlacement,
  filterFurnitureCatalog,
  normalizeFurnitureCatalog,
  positionFurnitureToolbar,
  resolveFurnitureToolbarMode,
  shouldUpdateFurniturePreview,
} from "../viewer/furniture-placement.mjs";

const manifest = { items: [
  { category: "chair", fileName: "oak-chair.glb", relativePath: "chair/oak-chair.glb", sizeMm: { width: 500, height: 800, depth: 520 } },
  { category: "bed", fileName: "white-bed.glb", relativePath: "bed/white-bed.glb", sizeMm: { width: 1600, height: 900, depth: 2100 } },
] };

const paginatedItems = normalizeFurnitureCatalog({ items: Array.from({ length: 125 }, (_, index) => ([
  {
    category: "chair",
    fileName: `chair-${String(index).padStart(3, "0")}.glb`,
    relativePath: `chair/chair-${String(index).padStart(3, "0")}.glb`,
    sizeMm: { width: 500, height: 800, depth: 520 },
  },
  {
    category: "bed",
    fileName: `bed-${String(index).padStart(3, "0")}.glb`,
    relativePath: `bed/bed-${String(index).padStart(3, "0")}.glb`,
    sizeMm: { width: 1600, height: 900, depth: 2100 },
  },
])).flat() });

test("normalizes manifest items into same-origin model URLs and meter dimensions", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.equal(items[0].modelUrl, "/floor-plan-3d/furniture-assets/chair/oak-chair.glb");
  assert.deepEqual(items[0].sizeMeters, { width: 0.5, height: 0.8, depth: 0.52 });
});

test("filters out manifest items missing catalog identity fields", () => {
  const items = normalizeFurnitureCatalog({ items: [
    manifest.items[0],
    { category: "chair", fileName: "missing-path.glb" },
    { category: "chair", relativePath: "chair/missing-name.glb" },
    { fileName: "missing-category.glb", relativePath: "chair/missing-category.glb" },
    null,
  ] });
  assert.deepEqual(items.map(item => item.fileName), ["oak-chair.glb"]);
});

test("cleans leading slashes from normalized asset paths", () => {
  const [item] = normalizeFurnitureCatalog({ items: [{
    category: "chair",
    fileName: "oak-chair.glb",
    relativePath: "///chair/oak-chair.glb",
  }] });
  assert.equal(item.relativePath, "chair/oak-chair.glb");
  assert.equal(item.modelUrl, "/floor-plan-3d/furniture-assets/chair/oak-chair.glb");
});

test("defaults missing dimensions to one meter", () => {
  const [item] = normalizeFurnitureCatalog({ items: [{
    category: "chair",
    fileName: "oak-chair.glb",
    relativePath: "chair/oak-chair.glb",
  }] });
  assert.deepEqual(item.sizeMm, { width: 1000, height: 1000, depth: 1000 });
  assert.deepEqual(item.sizeMeters, { width: 1, height: 1, depth: 1 });
});

test("filters by category and name without rendering beyond the requested limit", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.deepEqual(filterFurnitureCatalog(items, "oak", "chair", 60).map(item => item.fileName), ["oak-chair.glb"]);
});

test("trims query text and searches filenames case-insensitively", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.deepEqual(filterFurnitureCatalog(items, "  OAK-CHAIR  ", "chair").map(item => item.fileName), ["oak-chair.glb"]);
});

test("the all category keeps matches from every category", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.deepEqual(filterFurnitureCatalog(items, "", "all").map(item => item.fileName), ["oak-chair.glb", "white-bed.glb"]);
});

test("caps oversized pages at 60 matching catalog items", () => {
  const page = filterFurnitureCatalog(paginatedItems, "", "chair", 1000);
  assert.equal(page.length, 60);
  assert.equal(page[0].fileName, "chair-000.glb");
  assert.equal(page[59].fileName, "chair-059.glb");
});

test("uses offset to return the next filtered page", () => {
  const page = filterFurnitureCatalog(paginatedItems, "", "chair", 60, 60);
  assert.equal(page.length, 60);
  assert.equal(page[0].fileName, "chair-060.glb");
  assert.equal(page[59].fileName, "chair-119.glb");
});

test("clamps non-positive page sizes to one item", () => {
  const zeroPage = filterFurnitureCatalog(paginatedItems, "", "chair", 0);
  const negativePage = filterFurnitureCatalog(paginatedItems, "", "chair", -20);
  assert.deepEqual(zeroPage.map(item => item.fileName), ["chair-000.glb"]);
  assert.deepEqual(negativePage.map(item => item.fileName), ["chair-000.glb"]);
});

test("normalizes offsets to a non-negative integer", () => {
  const firstPage = filterFurnitureCatalog(paginatedItems, "", "chair", 1, -20);
  const laterPage = filterFurnitureCatalog(paginatedItems, "", "chair", 1, 60.9);
  assert.equal(firstPage[0].fileName, "chair-000.glb");
  assert.equal(laterPage[0].fileName, "chair-060.glb");
});

test("uses default pagination values for non-finite inputs", () => {
  const page = filterFurnitureCatalog(paginatedItems, "", "chair", Number.NaN, Number.NaN);
  assert.equal(page.length, 60);
  assert.equal(page[0].fileName, "chair-000.glb");
  assert.equal(page[59].fileName, "chair-059.glb");
});

test("placement records contain only persistent data", () => {
  const item = normalizeFurnitureCatalog(manifest)[0];
  const placement = createFurniturePlacement(item, { x: 1.2, y: 0, z: -0.4 }, "chair-1");
  placement.runtimeMesh = { transient: true };
  assert.deepEqual(cloneFurniturePlacements([placement]), [{
    id: "chair-1",
    relativePath: "chair/oak-chair.glb",
    position: [1.2, 0, -0.4],
    rotationY: 0,
    sizeMm: { width: 500, height: 800, depth: 520 },
  }]);
});

test("createFurniturePlacement generates a non-empty id by default", () => {
  const item = normalizeFurnitureCatalog(manifest)[0];
  const placement = createFurniturePlacement(item, { x: 0, y: 0, z: 0 });
  assert.equal(typeof placement.id, "string");
  assert.notEqual(placement.id.trim(), "");
});

test("resolves toolbar modes from furniture interaction state", () => {
  assert.equal(resolveFurnitureToolbarMode({ currentView: "3d" }), "hidden");
  assert.equal(resolveFurnitureToolbarMode({ currentView: "furnishing" }), "hidden");
  assert.equal(resolveFurnitureToolbarMode({
    currentView: "furnishing",
    hasSelectedFurniture: true,
  }), "selection");
  assert.equal(resolveFurnitureToolbarMode({
    currentView: "furnishing",
    hasSelectedFurniture: true,
    hasPendingFurniture: true,
  }), "pending");
});

test("positions and clamps a toolbar above its screen anchor", () => {
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 400,
    anchorY: 200,
    toolbarWidth: 180,
    toolbarHeight: 44,
    viewportWidth: 800,
    viewportHeight: 600,
  }), { left: 310, top: 144 });
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 0,
    anchorY: 0,
    toolbarWidth: 180,
    toolbarHeight: 44,
    viewportWidth: 800,
    viewportHeight: 600,
  }), { left: 8, top: 8 });
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 800,
    anchorY: 600,
    toolbarWidth: 180,
    toolbarHeight: 44,
    viewportWidth: 800,
    viewportHeight: 600,
  }), { left: 612, top: 544 });
});

test("updates a furniture preview only while tracking or for a forced floor click", () => {
  assert.equal(shouldUpdateFurniturePreview({ isTracking: true }), true);
  assert.equal(shouldUpdateFurniturePreview({ isTracking: false }), false);
  assert.equal(shouldUpdateFurniturePreview({ isTracking: false, force: true }), true);
});
