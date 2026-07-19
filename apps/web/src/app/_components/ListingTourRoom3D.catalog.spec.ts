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

test("opens the 500-item furniture editor directly from the listing tour button", () => {
  assert.match(tourSource, /import \{ Armchair \} from "lucide-react"/);
  assert.match(tourSource, /const \[furnitureLimit, setFurnitureLimit\] = useState\(30\)/);
  assert.match(tourSource, /const visibleFurnitureCatalog = useMemo/);
  assert.match(tourSource, /aria-label="가구 편집 열기"/);
  assert.match(tourSource, /onClick=\{openFurnitureEditor\}/);
  assert.match(tourSource, /<Armchair aria-hidden size=\{16\} strokeWidth=\{2\.4\} \/>/);
  assert.match(tourSource, /가구 더 보기 \(\{visibleFurnitureCatalog\.length\}\/\{filteredCatalog\.length\}\)/);
});

test("connects both pending-furniture rotation directions to the listing tour", () => {
  assert.match(tourSource, /function rotatePendingFurniture\(direction: -1 \| 1\)/);
  assert.match(tourSource, /rotateFurnitureQuarterTurn\(pendingFurniture, direction\)/);
  assert.match(tourSource, /onPendingRotate=\{rotatePendingFurniture\}/);
});

test("only enables pending deletion while an existing tour furniture item is being edited", () => {
  assert.match(tourSource, /const \[isPendingFurnitureEditing, setIsPendingFurnitureEditing\] = useState\(false\)/);
  assert.match(tourSource, /setIsPendingFurnitureEditing\(true\)/);
  assert.match(tourSource, /pendingFurnitureCanBeDeleted=\{isPendingFurnitureEditing\}/);
  assert.match(tourSource, /function deletePendingFurniture\(\)[\s\S]*?setIsPendingFurnitureEditing\(false\)/);
});
