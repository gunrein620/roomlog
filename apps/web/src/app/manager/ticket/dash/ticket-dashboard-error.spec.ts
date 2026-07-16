import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("manager ticket dashboard exposes a retryable API error boundary", () => {
  const errorPath = join(process.cwd(), "src/app/manager/ticket/dash/error.tsx");

  assert.equal(existsSync(errorPath), true, errorPath);
  const source = readFileSync(errorPath, "utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /role="alert"/);
  assert.match(source, /민원\/하자 데이터를 불러오지 못했습니다/);
  assert.match(source, /onClick=\{reset\}/);
  assert.match(source, /다시 시도/);
});
