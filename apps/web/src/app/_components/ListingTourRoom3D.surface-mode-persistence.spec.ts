import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");

test("keeps an owner furniture layout when only the 3D/Floor surface changes", () => {
  assert.match(source, /const furnitureSeed = floorPlan\?\.furnitures;/);
  assert.match(source, /const furnitureHydrationRef = useRef/);
  assert.match(source, /previousFurnitureSeed === furnitureSeed/);
  assert.match(source, /if \(!shouldHydrateFurniture\) return;/);
});
