import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const editorSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx"),
  "utf8"
);
const viewerSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);
const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function between(source: string, start: string, end: string) {
  const afterStart = source.split(start, 2)[1];
  assert.ok(afterStart, `missing start marker: ${start}`);
  const body = afterStart.split(end, 1)[0];
  assert.ok(body, `missing end marker: ${end}`);
  return body;
}

describe("RoomLog furniture floating controls", () => {
  it("shows four icon actions above a selected furniture item", () => {
    assert.match(viewerSource, /const selectedFurniture = furnitureData\.find/);
    const selectedToolbar = between(
      viewerSource,
      "{selectedFurniture && !pendingFurniture",
      "{pendingFurniture && onPendingConfirm"
    );

    for (const label of ["가구 이동", "왼쪽으로 90도 회전", "오른쪽으로 90도 회전", "가구 삭제"]) {
      assert.match(selectedToolbar, new RegExp(`aria-label="${label}"`));
    }
    for (const icon of ["<Move", "<RotateCcw", "<RotateCw", "<Trash2"]) {
      assert.match(selectedToolbar, new RegExp(icon));
    }
  });

  it("shows optional deletion between rotation and confirmation while furniture follows the pointer", () => {
    const pendingToolbar = between(
      viewerSource,
      "{pendingFurniture && onPendingConfirm",
      "</group>"
    );

    assert.match(pendingToolbar, /aria-label="배치 취소"/);
    assert.match(pendingToolbar, /aria-label="배치완료"/);
    assert.match(pendingToolbar, /onPendingRotate \? \(/);
    assert.match(pendingToolbar, /<RotateCcw/);
    assert.match(pendingToolbar, /<RotateCw/);
    assert.match(pendingToolbar, /pendingFurnitureCanBeDeleted && onPendingDelete \? \(/);
    assert.match(pendingToolbar, /aria-label="가구 삭제"/);
    assert.match(pendingToolbar, /<Trash2/);
    assert.match(editorSource, /function handle3DFloorPointerMove[\s\S]*?if \(!pendingFurniture\) return;/);
    assert.doesNotMatch(editorSource, /isFurnitureDragging/);
    assert.match(editorSource, /controlsEnabled=\{!pendingFurniture\}/);
  });

  it("receives each pending-toolbar action as a component parameter", () => {
    const componentParameters = between(
      viewerSource,
      "export function RoomlogThreeFloorPlanView({",
      "}: {"
    );

    for (const property of ["onPendingDelete", "onPendingRotate", "pendingFurnitureCanBeDeleted"]) {
      assert.match(componentParameters, new RegExp(`\\b${property},`));
    }
  });

  it("selects placed furniture before entering move mode", () => {
    const pointerHandler = between(
      editorSource,
      "function handleFurniturePointerDown",
      "function handleMouseDown"
    );
    assert.match(pointerHandler, /setSelectedFurnitureId\(furniture\.id\)/);
    assert.doesNotMatch(pointerHandler, /setPendingFurniture\(reopenFurnitureDraft\(furniture\)\)/);

    const moveHandler = between(
      editorSource,
      "function beginSelectedFurnitureMove",
      "function rotateSelectedFurniture"
    );
    assert.match(moveHandler, /setPendingFurniture\(reopenFurnitureDraft\(furniture\)\)/);
    assert.match(moveHandler, /pendingFurnitureOriginRef\.current = furniture/);
  });

  it("connects left rotation, right rotation, delete, cancel, and confirm separately", () => {
    assert.match(editorSource, /function rotateSelectedFurniture\(direction: -1 \| 1\)/);
    assert.match(editorSource, /rotateFurnitureQuarterTurn\(item, direction\)/);
    assert.match(editorSource, /function deleteSelectedFurniture\(\)/);
    assert.match(editorSource, /onSelectedMove=\{beginSelectedFurnitureMove\}/);
    assert.match(editorSource, /onSelectedRotateLeft=\{\(\) => rotateSelectedFurniture\(-1\)\}/);
    assert.match(editorSource, /onSelectedRotateRight=\{\(\) => rotateSelectedFurniture\(1\)\}/);
    assert.match(editorSource, /onSelectedDelete=\{deleteSelectedFurniture\}/);
    assert.match(editorSource, /setSelectedFurnitureId\(nextFurniture\.id\)/);
  });

  it("uses conspicuous green confirmation and red cancellation buttons", () => {
    assert.match(globalCss, /\.floor-plan-pending-actions button\.is-confirm[\s\S]*?background: #16a34a;/);
    assert.match(globalCss, /\.floor-plan-pending-actions button\.is-cancel[\s\S]*?background: #dc2626;/);
  });
});
