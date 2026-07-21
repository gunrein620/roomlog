import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");

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
