import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-materials/route.ts"),
  "utf8",
);

test("room material route forwards authenticated room-structure analysis", () => {
  assert.match(source, /serverFetch/);
  assert.match(source, /serverFetch<RoomMaterialAnalysis>\("\/floor-plans\/ai-analysis"/);
  assert.doesNotMatch(source, /"\/roomlog\/floor-plans\/ai-analysis"/);
  assert.match(source, /analysisMode:\s*"room-structure"/);
  assert.match(source, /model:\s*"openai\/floor-plan-vision"/);
  assert.match(source, /imageDataUrl/);
  assert.match(source, /현관/);
  assert.match(source, /공간명이 없어도/);
  assert.match(source, /주 출입문 근처/);
  assert.match(source, /가구와 치수선은 polygon에서 제외/);
  assert.match(source, /외벽에 연결된 주 출입문/);
  assert.match(source, /거실과 식당 사이에 경계를 임의로 만들지 마세요/);
  assert.match(source, /현관 polygon이 열린 거실 영역으로 확장되지 않도록/);
  assert.match(source, /15%/);
  assert.match(source, /6m²/);
});

test("room material route preserves upstream authentication errors", () => {
  assert.match(source, /ApiError/);
  assert.match(source, /error instanceof ApiError/);
  assert.match(source, /status:\s*error\.status/);
});
