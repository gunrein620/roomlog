import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const globalsSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
// 카테고리 가로 스크롤 컨트롤은 PR #167에서 공유 패널(FurnitureCatalogPanel)로 이동했다.
const panelSource = readFileSync(join(process.cwd(), "src/app/_components/FurnitureCatalogPanel.tsx"), "utf8");

test("shows an always-visible custom horizontal control below the furniture category chips", () => {
  assert.match(
    panelSource,
    /aria-label="가구 카테고리 가로 스크롤"[\s\S]*className="listing-tour-furniture-category-scrollbar"[\s\S]*type="range"/,
  );
  assert.match(
    panelSource,
    /onScroll=\{syncCategoryScroll\}/,
  );
  assert.match(
    panelSource,
    /onInput=\{\(event\) => handleCategoryScrollInput/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-scrollbar::-webkit-slider-runnable-track\s*\{[^}]*height:\s*8px;[^}]*background:\s*#f2f2f2;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-scrollbar::-webkit-slider-thumb\s*\{[^}]*width:\s*64px;[^}]*background:\s*#8e8e8e;[^}]*\}/,
  );
});
