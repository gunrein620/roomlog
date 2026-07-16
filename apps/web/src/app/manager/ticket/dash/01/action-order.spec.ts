import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

test("vendor assignment appears before AI reply in the next-action row", () => {
  const vendorIndex = source.indexOf("업체 배정/견적");
  const replyIndex = source.indexOf("AI 답변/거절 통보");

  assert.notEqual(vendorIndex, -1);
  assert.notEqual(replyIndex, -1);
  assert.ok(vendorIndex < replyIndex);
});
