import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const tourSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const editorSource = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx"), "utf8");

test("loads the 3D rendering GLB furniture catalog for the listing tour", () => {
  assert.match(tourSource, /loadGlbDatasetCatalog/);
  assert.match(tourSource, /const \[furnitureCatalog, setFurnitureCatalog\] = useState<FurnitureCatalogItem\[\]>\(FURNITURE_CATALOG\)/);
  assert.match(tourSource, /const datasetItems = await loadGlbDatasetCatalog\(\)/);
  assert.match(tourSource, /setFurnitureCatalog\(datasetItems\)/);
  assert.match(tourSource, /const matchesQuery = !normalizedQuery \|\| catalogSearchText\(item\)\.includes\(normalizedQuery\)/);
});

test("uses the same furniture categories as the 3D rendering editor", () => {
  assert.match(editorSource, /listFurnitureCategoryFilters/);
  assert.match(editorSource, /furnitureCategoryLabel,\s*\n\s*furnitureImageUrl/);
  assert.match(tourSource, /listFurnitureCategoryFilters/);
  assert.match(tourSource, /const \[furnitureCategoryFilter, setFurnitureCategoryFilter\] = useState\("전체"\)/);
  assert.match(tourSource, /const furnitureCategoryFilters = useMemo/);
  assert.match(tourSource, /matchesCategory/);
  assert.match(tourSource, /listing-tour-furniture-category-tabs/);
});
