import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/manager/billing/overdue/page.tsx"), "utf8");

test("overdue page omits the case management header copy", () => {
  assert.doesNotMatch(source, /케이스 관리/);
  assert.doesNotMatch(source, /연체 관리/);
  assert.doesNotMatch(source, /실제 경과일과 납부 확인 상태를 기준으로 한 건씩 검토합니다\. 독촉은 화면에서 바로 발송하지 않습니다\./);
});
