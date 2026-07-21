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

test("owner furniture page restores the three-way bottom view switch", () => {
  assert.match(component, /aria-label="도면 보기 전환"/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /onClick=\{\(\) => requestViewChange\("original"\)\}[\s\S]*?>2D<\/button>/);
  assert.match(component, /onClick=\{\(\) => requestViewChange\("3d"\)\}[\s\S]*?>3D<\/button>/);
  assert.match(component, /aria-selected="true"[\s\S]*?>가구 배치<\/button>/);
});

test("2D and 3D view changes auto-save before resuming the editor", () => {
  assert.match(component, /function requestViewChange\(destination: "original" \| "3d"\)/);
  assert.match(component, /ownerSaveRequestRef\.current\?\.\(destination\)/);
  assert.match(component, /buildOwnerFloorPlanResumePath\(returnOrigin, requestId, destination\)/);
  assert.match(component, /window\.location\.href = buildOwnerFloorPlanResumePath/);
});

test("an auto-save failure stays beside the bottom view switch", () => {
  assert.match(component, /const \[actionError, setActionError\] = useState\(""\)/);
  assert.match(component, /catch \{[\s\S]*?setActionError\("가구 배치를 저장하지 못했습니다/);
  assert.match(component, /actionError \? <p className="owner-furniture-action-error" role="alert">\{actionError\}<\/p> : null/);
});
