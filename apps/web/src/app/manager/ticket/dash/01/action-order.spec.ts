import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

test("registered vendor assignment is embedded without obsolete action links", () => {
  assert.match(source, /<RegisteredVendorAssignment/);
  assert.doesNotMatch(source, /업체 배정\/견적/);
  assert.doesNotMatch(source, /답변 초안 생성/);
  assert.doesNotMatch(source, /ticketDashHref\("0[34]"/);
  assert.doesNotMatch(source, /AI 답변\/거절 통보/);
});
