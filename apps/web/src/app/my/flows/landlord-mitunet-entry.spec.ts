import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/my/flows/LandlordMyPage.tsx"), "utf8");

test("opens MitUNet as a real RoomLog internal page", () => {
  assert.match(source, /buildRoomlogMitunetEditorPath/);
  assert.match(source, /window\.location\.href = editorPath/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_MITUNET_EDITOR_URL/);
  assert.doesNotMatch(source, /buildMitunetEditorUrl/);
  assert.doesNotMatch(source, /parseMitunetMessage/);
  assert.doesNotMatch(source, /window\.open/);
  // 진입은 빈 3D 박스 클릭 자체(박스가 곧 버튼) — 별도 "만들기" 버튼 없이 openMitunetEditor로 이동한다.
  assert.match(source, /눌러서 3D 도면을 만들어요/);
  assert.doesNotMatch(source, /href="\/floor-plan-3d"/);
});

test("keeps a JSON upload fallback for MitUNet projects", () => {
  assert.match(source, /parseMitunetProjectJson/);
  // JSON 업로드는 가시 라벨 대신 3D 박스의 숨은 드롭으로만 지원(개발자용) — 드롭 배선으로 검증한다.
  assert.match(source, /handleFloorPlanJsonDrop/);
});
