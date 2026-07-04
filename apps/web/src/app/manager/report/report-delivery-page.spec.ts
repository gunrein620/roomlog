import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "03/page.tsx"), "utf8");

test("manager report delivery page creates external shares only from an explicit form action", () => {
  assert.match(source, /createReportExternalShare/);
  assert.match(source, /async function createExternalShareAction/);
  assert.match(source, /"use server"/);
  assert.match(source, /await createReportExternalShare\(reportId, recipientName\)/);
  assert.match(source, /<form action=\{createExternalShareAction\}>/);
  assert.match(source, /name="reportId"/);
  assert.match(source, /name="recipientName"/);
  assert.doesNotMatch(source, /<LinkButton href=\{reportHref\("M-RPT-02", report\.id\)\}>전달\/내보내기 확정<\/LinkButton>/);
});
