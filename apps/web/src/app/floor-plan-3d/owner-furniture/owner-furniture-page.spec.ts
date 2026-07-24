import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const component = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/owner-furniture/OwnerFurnitureSimulation.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/owner-furniture/owner-furniture.css"), "utf8");

test("owner furniture page loads handoff and uses the shared first-person experience", () => {
  assert.match(component, /className="owner-furniture-page is-3d-simulation-open"/);
  assert.match(component, /readOwnerFurnitureDraft/);
  assert.match(component, /experience="owner"/);
  assert.match(component, /initialSimulationMode="furniture"/);
  assert.match(component, /onOwnerFurnitureSave=\{saveAndReturn\}/);
});

test("restores a missing source plan image from the saved editor snapshot", () => {
  assert.match(component, /function sourcePlanImageFromEditorSnapshot\(snapshot\?: OwnerFurnitureEditorSnapshot\)/);
  assert.match(component, /const recoveredSourceImageB64 = sourcePlanImageFromEditorSnapshot\(nextDraft\.editorSnapshot\);/);
  assert.match(component, /sourceImageB64: recoveredSourceImageB64/);
});

test("owner save writes the request snapshot before returning to registration", () => {
  assert.match(component, /roomlogListingFloorPlan3D:\$\{requestId\}/);
  assert.match(component, /floorPlanRequestId/);
  assert.match(component, /#my-page/);
});

test("owner save-and-exit returns to the selected 3D or Floor editor surface", () => {
  assert.match(component, /className="owner-furniture-save"/);
  assert.match(component, /onClick=\{\(\) => ownerSaveRequestRef\.current\?\.\(activeSurfaceView\)\}/);
  assert.match(component, />저장하고 3D 뷰로 나가기<\/button>/);
  assert.match(component, /ownerSaveRequestRef=\{ownerSaveRequestRef\}/);
});

test("owner furniture page marks the saved surface mode in the bottom view switch", () => {
  assert.match(component, /aria-label="도면 보기 전환"/);
  assert.match(component, /role="tablist"/);
  assert.doesNotMatch(component, />2D<\/button>/);
  assert.match(component, /const activeSurfaceView = surfaceMode === "floor" \? "floor" : "3d";/);
  assert.match(component, /aria-selected=\{activeSurfaceView === "3d"\}[\s\S]*?className=\{activeSurfaceView === "3d" \? "active" : undefined\}[\s\S]*?>3D<\/button>/);
  assert.match(component, /aria-selected=\{activeSurfaceView === "floor"\}[\s\S]*?className=\{activeSurfaceView === "floor" \? "active" : undefined\}[\s\S]*?>Floor<\/button>/);
});

test("centers the two surface buttons without an unused third slot", () => {
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(styles, /left: 50%;/);
  assert.match(styles, /transform: translateX\(-50%\);/);
});

test("Floor changes only the furniture preview surface and keeps that surface when saving", () => {
  assert.match(component, /const \[surfaceMode, setSurfaceMode\] = useState<"floor" \| "source">\("floor"\);/);
  assert.match(component, /const floorPlanForSurface = \{/);
  assert.match(component, /\? \{ mitunet: \{ \.\.\.draft\.floorPlan\.mitunet, surfaceMode \} \}/);
  assert.match(component, /floorPlan=\{floorPlanForSurface\}/);
  assert.match(component, /onClick=\{\(\) => setSurfaceMode\("source"\)\}/);
  assert.match(component, /onClick=\{\(\) => setSurfaceMode\("floor"\)\}/);
  assert.match(component, /const floorPlan = \{/);
  assert.match(component, /\? \{ mitunet: \{ \.\.\.draft\.floorPlan\.mitunet, surfaceMode \} \}/);
  assert.match(component, /furnitures/);
});

test("surface controls stay inside furniture placement", () => {
  assert.doesNotMatch(component, /function requestViewChange/);
  assert.doesNotMatch(component, /onClick=\{\(\) => requestViewChange/);
});

test("marks the owner return as a one-time editor resume", () => {
  assert.match(
    component,
    /window\.sessionStorage\.setItem\(`roomlogOwnerFurnitureResume:\$\{requestId\}`, destination\);[\s\S]*?window\.location\.href = buildOwnerFloorPlanResumePath/,
  );
});

test("an auto-save failure stays beside the bottom view switch", () => {
  assert.match(component, /const \[actionError, setActionError\] = useState\(""\)/);
  assert.match(component, /catch \{[\s\S]*?setActionError\("가구 배치를 저장하지 못했습니다/);
  assert.match(component, /actionError \? <p className="owner-furniture-action-error" role="alert">\{actionError\}<\/p> : null/);
});
