import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const component = readFileSync(join(__dirname, "ManagerListingBoard.tsx"), "utf8");
const css = readFileSync(join(__dirname, "ManagerListingBoard.module.css"), "utf8");

test("listing cards open an accessible native detail dialog", () => {
  assert.match(component, /aria-label=\{`\$\{listing\.title\} 상세정보 보기`\}/);
  assert.match(component, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(component, /<dialog/);
  assert.match(component, /aria-labelledby="manager-listing-dialog-title"/);
  assert.match(component, /isDialogBackdropPoint/);
  assert.match(component, /aria-label="매물 상세정보 닫기"/);
});

test("detail dialog exposes edit and confirmed removal flows", () => {
  for (const text of ["수정", "매물 내리기", "수정 취소", "변경사항 저장", "정말 매물 내리기"]) {
    assert.match(component, new RegExp(text));
  }
  assert.match(component, /updateManagerListing/);
  assert.match(component, /removeManagerListing/);
  assert.match(component, /toManagerListingRow/);
  assert.match(component, /setListings\(\(current\) => current\.map/);
  assert.match(component, /setListings\(\(current\) => current\.filter/);
});

test("edit mode exposes individual photo and 3D floor plan controls", () => {
  for (const text of ["사진 추가", "대표 사진", "3D 도면 다시 열기", "도면 JSON 업로드", "3D 연결 해제"]) {
    assert.match(component, new RegExp(text));
  }
  assert.match(component, /accept="image\/\*"/);
  assert.match(component, /multiple/);
  assert.match(component, /aria-label=\{`사진 \$\{index \+ 1\} 삭제`\}/);
  assert.match(component, /accept="\.json,application\/json"/);
  assert.match(component, /target="_blank"/);
  assert.match(component, /buildRoomlogMitunetEditorPath/);
  assert.match(component, /managerFloorPlanRequestId/);
  assert.match(component, /\/floor-plan-3d\/mitunet/);
  assert.match(component, /readManagerListingFloorPlanSnapshot/);
});

test("save uploads new photos before patching the final listing media", () => {
  const uploadPosition = component.indexOf("await uploadManagerListingPhotos");
  const updatePosition = component.indexOf("await updateManagerListing");
  assert.ok(uploadPosition >= 0);
  assert.ok(updatePosition > uploadPosition);
  assert.match(component, /images: \[\.\.\.existingImages, \.\.\.uploadedImages\]/);
  assert.match(component, /floorPlan: floorPlanDraft/);
});

test("dialog styles use shared tokens without raw colors", () => {
  assert.match(css, /var\(--error\)/);
  assert.match(css, /var\(--surface-container-lowest\)/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}/i);
});
