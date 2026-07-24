import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/splat-tour/tour-viewer.tsx", "utf8");
// 가구 카탈로그 UI(검색·카테고리·그리드·카드·Poly Haven 탭)는 PR #167에서 공유 패널로 추출됐다.
// tour-viewer는 드로어 셸·놓인 가구·배치 컨트롤만 소유하고 카탈로그는 이 패널에 위임한다.
const panelSource = readFileSync("src/app/_components/FurnitureCatalogPanel.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");

describe("splat tour furniture catalog drawer", () => {
  it("opens the shared 500-item catalog from the furniture control", () => {
    assert.match(source, /loadGlbDatasetCatalog/);
    assert.match(source, /isFurnitureCatalogOpen/);
    assert.match(source, /aria-label="가구 카탈로그"/);
  });

  it("connects catalog selection and local persistence to the tour", () => {
    assert.match(source, /beginTourFurnitureDraft/);
    // 매물별 키로 저장한다 — 전역 최신본 키는 매물 간 가구 누출 원인이라 제거됐다(f3f4c40c).
    assert.match(source, /listingTourFurnitureStorageKey/);
    assert.match(source, /onFloorPointerDown/);
    assert.match(source, /onFurniturePointerDown/);
  });

  it("delegates the catalog list UI to the shared FurnitureCatalogPanel", () => {
    assert.match(source, /<FurnitureCatalogPanel/);
    assert.match(source, /import FurnitureCatalogPanel/);
    // 세 소스 탭(내 가구·등록 가구·폴리)은 패널이 그린다.
    assert.match(panelSource, /내 가구[\s\S]*등록 가구[\s\S]*폴리/);
  });

  it("clips long furniture names inside each catalog card (shared panel styling)", () => {
    assert.match(styles, /\.listing-tour-furniture-grid strong\s*\{[\s\S]*?text-overflow:\s*ellipsis;/);
  });

  it("uses the same placement controls as the 3D renderer", () => {
    assert.match(source, /className="floor-plan-pending-actions tour-furniture-placement-actions"/);
    assert.match(source, /aria-label="배치 취소"/);
    assert.match(source, /aria-label="왼쪽으로 90도 회전"/);
    assert.match(source, /aria-label="오른쪽으로 90도 회전"/);
    assert.match(source, /aria-label="배치완료"/);
  });

  it("keeps the drawer shell and placed-furniture list owned by the tour viewer", () => {
    assert.match(source, /className="tour-furniture-drawer"/);
    assert.match(source, /tour-furniture-placed/);
  });

  it("shows an explicit horizontal category scrollbar in the shared panel", () => {
    assert.match(panelSource, /aria-label="가구 카테고리 가로 스크롤"/);
    assert.match(panelSource, /className="listing-tour-furniture-category-scrollbar"/);
    assert.match(styles, /\.listing-tour-furniture-category-scrollbar\s*\{/);
  });
});
