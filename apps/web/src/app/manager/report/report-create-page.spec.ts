import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "01/page.tsx"), "utf8");

test("manager report create page submits an explicit server-side create action", () => {
  assert.match(source, /import \{ redirect \} from "next\/navigation"/);
  assert.match(source, /createManagerReport/);
  assert.match(source, /async function createReportAction/);
  assert.match(source, /"use server"/);
  assert.match(source, /await createManagerReport\(\)/);
  assert.match(source, /redirect\(/);
  assert.match(source, /<form action=\{createReportAction\}>/);
  assert.doesNotMatch(source, /<LinkButton href=\{MANAGER_REPORT_ROUTES\["M-RPT-02"\]\}>리포트 생성<\/LinkButton>/);
});
