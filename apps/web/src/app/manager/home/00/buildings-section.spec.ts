import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("buildings section omits inert search and filter controls while keeping linked building cards", () => {
  const source = readFileSync(
    join(root, "src/app/manager/home/00/sections/BuildingsSection.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /<Input\b/);
  assert.doesNotMatch(source, /건물명, 지역, 담당자 검색/);
  assert.doesNotMatch(source, /리스크순|수납률순|월세순|공실순|담당자", "유형", "지역", "상태/);
  assert.match(source, /<Link key=\{building\.name\}/);
  assert.match(source, /MHOME_ROUTES\["M-HOME-04"\]/);
});
