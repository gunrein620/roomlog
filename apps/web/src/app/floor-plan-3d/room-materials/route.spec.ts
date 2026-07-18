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
  assert.match(source, /roomType/);
  assert.match(source, /LIVING_ROOM/);
  assert.match(source, /BATHROOM/);
  assert.match(source, /ENTRY/);
  assert.match(source, /모든 글자.*빠짐없이 읽으세요/);
  assert.match(source, /글자도 패턴 단서도 없는 공간만 UNKNOWN/);
  assert.match(source, /가구와 치수선·치수숫자는 polygon에서 제외/);
  assert.match(source, /거실과 식당이 벽 없이 열린 하나의 공간/);
});

test("room material route explicitly classifies bathroom, utility, and entry cues", () => {
  assert.match(source, /변기·세면대·욕조·샤워부스/);
  assert.match(source, /다용도실·세탁실·보일러실·실외기실/);
  assert.match(source, /출입문 안쪽에 체크무늬 바닥이 보이면/);
});

test("room material route uses the checkerboard-floor cue for entrances", () => {
  assert.match(source, /체크무늬\(격자\/다이아몬드\) 타일 패턴/);
});

test("room material route classifies unlabeled rooms from visual pattern cues", () => {
  assert.match(source, /타일 격자\/해칭 패턴/);
  assert.match(source, /싱크대·조리대·가스레인지/);
  assert.match(source, /창문 라인 바깥쪽의 좁고 긴 공간/);
  assert.match(source, /침대 기호가 있는 닫힌 방은 BEDROOM/);
});

test("room material route seeds the model with common Korean room-name examples", () => {
  assert.match(source, /안방·침실.*=BEDROOM/);
  assert.match(source, /드레스룸.*=DRESS_ROOM/);
  assert.match(source, /confidence를 0\.7 이상/);
});

test("room material route separates shared circulation from the private entry", () => {
  assert.match(source, /COMMON_AREA/);
  assert.match(source, /공용 복도.*계단실.*엘리베이터 홀/);
  assert.match(source, /세대 내부.*현관.*ENTRY/);
  assert.match(source, /COMMON_AREA polygon은 현관문 바깥쪽/);
  assert.match(source, /구분할 수 없으면.*반환하지 마세요/);
});

test("room material route preserves upstream authentication errors", () => {
  assert.match(source, /ApiError/);
  assert.match(source, /error instanceof ApiError/);
  assert.match(source, /status:\s*error\.status/);
});
