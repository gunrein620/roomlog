import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("sends the room and entry constraints as the room-material user prompt", () => {
  assert.match(routeSource, /모든 실내 공간의 이름과 닫힌 polygon/);
  assert.match(routeSource, /연결된 열린 영역의 15% 이내/);
  assert.match(routeSource, /현관 polygon을 6m² 이내/);
  assert.match(routeSource, /공용 복도, 계단실, 엘리베이터 홀/);
  assert.match(routeSource, /세대 내부에 있는 바닥 영역만/);
});

test("asks for mutually exclusive room polygons in one open floor area", () => {
  assert.match(routeSource, /polygon끼리 겹치지 마세요/);
  assert.match(routeSource, /중복 반환하지 마세요/);
});
