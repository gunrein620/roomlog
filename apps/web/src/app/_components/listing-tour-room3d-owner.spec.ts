import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

test("shared 3D simulation exposes owner overview and persistence adapter", () => {
  assert.match(source, /experience\?: "listing" \| "owner"/);
  assert.match(source, /initialSimulationMode\?: SimulationMode/);
  assert.match(source, /onOwnerFurnitureSave\?: \(furnitures: ListingFloorPlanFurniture\[\]\) => void/);
  assert.match(source, /ownerSaveRequestRef\?: MutableRefObject<\(\(\) => void\) \| null>/);
  assert.match(source, /experience === "owner" \? "전체보기" : "워킹뷰"/);
  assert.match(source, /confirmedFurnituresForOwnerSave/);
  assert.match(source, /ownerSaveRequestRef\.current = saveFurnitureLayout/);
});

test("owner overview uses orbit controls while furniture keeps first-person controls", () => {
  assert.match(source, /simulationMode === "walk" \? "walk" : "orbit"/);
  assert.match(source, /simulationMode === "furniture"/);
  assert.match(source, /furnitureFirstPersonEnabled/);
});

test("owner furniture catalog uses horizontal source tabs and readable large cards", () => {
  assert.match(source, /type FurnitureSourceTab = "mine" \| "catalog"/);
  assert.match(source, /useState<FurnitureSourceTab>\(experience === "owner" \? "mine" : "catalog"\)/);
  assert.match(source, /aria-label="가구 목록 종류"[\s\S]*className="listing-tour-furniture-source-tabs"[\s\S]*내 가구[\s\S]*등록 가구/);
  assert.match(source, /furnitureSourceTab === "mine"/);
  assert.match(source, /furnitureSourceTab === "catalog"/);
  assert.match(styles, /\.is-3d-simulation-open \.hero-stage \.hero-furniture-drawer \{[\s\S]*width: min\(460px, calc\(100% - 24px\)\)/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-thumb \{[\s\S]*width: 82px;[\s\S]*height: 82px;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid (?:strong|strong,)[\s\S]*text-overflow: clip;[\s\S]*white-space: normal;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid strong \{[\s\S]*font-size: 0\.86rem;/);
  assert.match(styles, /\.is-3d-simulation-open \.listing-tour-furniture-grid small \{[\s\S]*font-size: 0\.75rem;/);
});
