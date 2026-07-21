import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const component = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/owner-furniture/OwnerFurnitureSimulation.tsx"), "utf8");

test("owner furniture page loads handoff and uses the shared first-person experience", () => {
  assert.match(component, /className="owner-furniture-page is-3d-simulation-open"/);
  assert.match(component, /readOwnerFurnitureDraft/);
  assert.match(component, /experience="owner"/);
  assert.match(component, /initialSimulationMode="furniture"/);
  assert.match(component, /onOwnerFurnitureSave=\{saveAndReturn\}/);
});

test("owner save writes the request snapshot before returning to registration", () => {
  assert.match(component, /roomlogListingFloorPlan3D:\$\{requestId\}/);
  assert.match(component, /floorPlanRequestId/);
  assert.match(component, /#my-page/);
});

test("owner save-and-exit action stays outside the view modes", () => {
  assert.match(component, /className="owner-furniture-save"/);
  assert.match(component, />저장하고 나오기<\/button>/);
  assert.match(component, /ownerSaveRequestRef=\{ownerSaveRequestRef\}/);
});
