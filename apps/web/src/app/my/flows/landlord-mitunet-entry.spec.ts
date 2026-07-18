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
  assert.match(source, /3D 도면 만들기/);
  assert.doesNotMatch(source, /href="\/floor-plan-3d"/);
});

test("keeps a JSON upload fallback for MitUNet projects", () => {
  assert.match(source, /parseMitunetProjectJson/);
  assert.match(source, /도면 JSON 업로드/);
});
