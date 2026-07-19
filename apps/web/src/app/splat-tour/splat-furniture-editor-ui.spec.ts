import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/splat-tour/tour-viewer.tsx", "utf8");

describe("splat tour furniture catalog drawer", () => {
  it("opens the shared 500-item catalog from the furniture control", () => {
    assert.match(source, /loadGlbDatasetCatalog/);
    assert.match(source, /isFurnitureCatalogOpen/);
    assert.match(source, /aria-label="가구 카탈로그"/);
  });

  it("connects catalog selection and local persistence to the tour", () => {
    assert.match(source, /beginTourFurnitureDraft/);
    assert.match(source, /LISTING_TOUR_FURNITURE_LATEST_KEY/);
    assert.match(source, /onFloorPointerDown/);
    assert.match(source, /onFurniturePointerDown/);
  });

  it("clips long furniture names inside each catalog card", () => {
    assert.match(source, /className="tour-furniture-copy"/);
    assert.match(source, /\.tour-furniture-copy\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/);
    assert.match(source, /\.tour-furniture-item strong,[\s\S]*?display:\s*block;[\s\S]*?text-overflow:\s*ellipsis;/);
  });

  it("uses the same placement controls as the 3D renderer", () => {
    assert.match(source, /className="floor-plan-pending-actions tour-furniture-placement-actions"/);
    assert.match(source, /aria-label="배치 취소"/);
    assert.match(source, /aria-label="왼쪽으로 90도 회전"/);
    assert.match(source, /aria-label="오른쪽으로 90도 회전"/);
    assert.match(source, /aria-label="배치완료"/);
  });

  it("keeps the placement controls visible while only the catalog list scrolls", () => {
    assert.match(source, /\.tour-furniture-drawer\s*\{[\s\S]*?height:\s*min\(620px, calc\(100% - 110px\)\);[\s\S]*?grid-template-rows:/);
    assert.match(source, /\.tour-furniture-grid\s*\{[\s\S]*?min-height:\s*0;/);
    assert.match(source, /\.tour-furniture-placed\s*\{[\s\S]*?max-height:[^;]+;[\s\S]*?overflow-y:\s*auto;/);
  });

  it("keeps every catalog card tall enough for its thumbnail when more items are shown", () => {
    assert.match(source, /\.tour-furniture-grid\s*\{[\s\S]*?grid-auto-rows:\s*58px;/);
  });
});
