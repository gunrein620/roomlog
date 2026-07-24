import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
// 소스 탭(내 가구·등록 가구·폴리) UI와 타입은 PR #167에서 공유 패널로 추출됐다.
const panelSource = readFileSync(join(process.cwd(), "src/app/_components/FurnitureCatalogPanel.tsx"), "utf8");

test("shared 3D simulation exposes owner overview and persistence adapter", () => {
  assert.match(source, /experience\?: "listing" \| "owner"/);
  assert.match(source, /initialSimulationMode\?: SimulationMode/);
  assert.match(source, /onOwnerFurnitureSave\?: \(furnitures: ListingFloorPlanFurniture\[\], destination: OwnerFurnitureSaveDestination\) => void/);
  assert.match(source, /ownerSaveRequestRef\?: MutableRefObject<\(\(destination\?: OwnerFurnitureSaveDestination\) => void\) \| null>/);
  assert.match(source, /experience === "owner" \? "전체보기" : "워킹뷰"/);
  assert.match(source, /confirmedFurnituresForOwnerSave/);
  assert.match(source, /ownerSaveRequestRef\.current = saveFurnitureLayout/);
});

test("owner persistence adapter forwards the requested navigation destination", () => {
  assert.match(source, /export type OwnerFurnitureSaveDestination = "listing" \| "original" \| "3d"/);
  assert.match(source, /onOwnerFurnitureSave\?: \(furnitures: ListingFloorPlanFurniture\[\], destination: OwnerFurnitureSaveDestination\) => void/);
  assert.match(source, /ownerSaveRequestRef\?: MutableRefObject<\(\(destination\?: OwnerFurnitureSaveDestination\) => void\) \| null>/);
  assert.match(source, /function saveFurnitureLayout\(destination: OwnerFurnitureSaveDestination = "listing"\)/);
  assert.match(source, /onOwnerFurnitureSave\?\.\(serializeFurnitureLayout\(confirmedFurnituresForOwnerSave\(\)\), destination\)/);
});

test("owner overview uses orbit controls while furniture keeps first-person controls", () => {
  assert.match(source, /simulationMode === "walk" \? "walk" : "orbit"/);
  assert.match(source, /simulationMode === "furniture"/);
  assert.match(source, /furnitureFirstPersonEnabled/);
});

test("owner furniture catalog uses horizontal source tabs and readable large cards", () => {
  // 타입·소스탭 UI는 공유 패널이 소유(내 가구·등록 가구·폴리 3탭). 호스트는 상태만 들고 위임한다.
  assert.match(panelSource, /export type FurnitureSourceTab = "mine" \| "catalog" \| "poly"/);
  assert.match(source, /useState<FurnitureSourceTab>\(experience === "owner" \? "mine" : "catalog"\)/);
  assert.match(panelSource, /aria-label="가구 목록 종류"[\s\S]*className="listing-tour-furniture-source-tabs"[\s\S]*내 가구[\s\S]*등록 가구[\s\S]*폴리/);
  assert.match(panelSource, /sourceTab === "mine"/);
  assert.match(panelSource, /sourceTab === "catalog"/);
  assert.match(styles, /\.is-3d-simulation-open \.hero-stage \.hero-furniture-drawer \{[\s\S]*width: min\(460px, calc\(100% - 24px\)\)/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-thumb \{[\s\S]*width: 82px;[\s\S]*height: 82px;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid (?:strong|strong,)[\s\S]*text-overflow: clip;[\s\S]*white-space: normal;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid strong \{[\s\S]*font-size: 0\.86rem;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid small \{[\s\S]*font-size: 0\.75rem;/);
  assert.match(styles, /\.is-3d-simulation-open \.hero-stage \.listing-tour-furniture-head strong \{[\s\S]*font-size: 1rem;[\s\S]*font-weight: 700;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-source-tabs button \{[\s\S]*font-size: 0\.9rem;[\s\S]*font-weight: 700;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-search input \{[\s\S]*font-size: 0\.85rem;[\s\S]*font-weight: 500;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-category-tabs button \{[\s\S]*font-size: 0\.78rem;[\s\S]*font-weight: 600;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-actions button \{[\s\S]*font-size: 0\.82rem;[\s\S]*font-weight: 700;/);
});
