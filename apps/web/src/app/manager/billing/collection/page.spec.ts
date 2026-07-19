import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/manager/billing/collection/page.tsx"), "utf8");

test("collection page omits the analysis header copy", () => {
  assert.doesNotMatch(source, /수금 분석/);
  assert.doesNotMatch(source, /수금 현황/);
  assert.doesNotMatch(source, /선택 범위의 수금률과 수납 시점을 분석하고 원하는 기간의 실적 변화를 비교합니다\./);
});
