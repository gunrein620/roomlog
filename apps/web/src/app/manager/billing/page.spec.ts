import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/manager/billing/page.tsx"), "utf8");

test("billing dashboard omits the summary header copy", () => {
  assert.doesNotMatch(source, /종합 업무 화면/);
  assert.doesNotMatch(source, /청구 대시보드/);
  assert.doesNotMatch(source, /선택한 달의 수금, 최근 입금, 연체를 빠르게 확인하고 아래 원장에서 처리 대상을 찾습니다\./);
});
