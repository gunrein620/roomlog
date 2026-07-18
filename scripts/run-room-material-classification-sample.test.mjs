import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "scripts/run-room-material-classification-sample.mjs"),
  "utf8",
);

test("classification sample accepts a model and reasoning-effort override", () => {
  assert.match(source, /readOption\("--model"/);
  assert.match(source, /readOption\("--effort"/);
  assert.match(source, /reasoning:\s*\{\s*effort\s*\}/);
});

test("classification sample records an elapsed time for each image", () => {
  assert.match(source, /elapsedMs/);
  assert.match(source, /Date\.now\(\)/);
});

test("classification sample reports the actual number of requested image files", () => {
  assert.match(source, /promptMode: "current-roomlog",\s*requestedImages: entries\.length/);
});

test("classification sample uses the deployed room and entry constraints", () => {
  assert.match(source, /Roomlog의 도면 방 구조 분석기/);
  assert.match(source, /모든 실내 공간의 이름과 닫힌 polygon/);
  assert.match(source, /연결된 열린 영역의 15% 이내/);
  assert.match(source, /현관 polygon을 6m² 이내/);
  assert.match(source, /공용 복도, 계단실, 엘리베이터 홀/);
  assert.match(source, /세대 내부.*현관 바닥.*ENTRY/);
});

test("classification sample requests non-overlapping room polygons", () => {
  assert.match(source, /polygon끼리 겹치지 마세요/);
  assert.match(source, /중복 반환하지 마세요/);
});

test("classification sample keeps common circulation outside the private entry", () => {
  assert.match(source, /"COMMON_AREA"/);
  assert.match(source, /공용 복도.*계단실.*엘리베이터 홀/);
  assert.match(source, /세대 내부.*현관.*ENTRY/);
  assert.match(source, /COMMON_AREA polygon은 현관문 바깥쪽/);
});
