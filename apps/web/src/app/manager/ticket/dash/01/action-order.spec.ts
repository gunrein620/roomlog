import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

test("vendor assignment appears beside the reply draft action", () => {
  const vendorIndex = source.indexOf("업체 배정/견적");
  const replyIndex = source.indexOf("답변 초안 생성");

  assert.notEqual(vendorIndex, -1);
  assert.notEqual(replyIndex, -1);
  assert.ok(vendorIndex < replyIndex);
  assert.doesNotMatch(source, /justifyContent: "space-between"/);
  assert.doesNotMatch(source, /AI 답변\/거절 통보/);
});
