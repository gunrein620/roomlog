import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "report-api.ts"), "utf8");

test("report API is wired to authenticated manager report backend endpoints", () => {
  assert.match(source, /from "\.\/server-api"/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_API_URL/);
  assert.doesNotMatch(source, /\/reports\/manager/);
  assert.match(source, /manager\/reports/);
  assert.match(source, /source-references/);
  assert.match(source, /external-shares/);
  assert.match(source, /audit-log/);
  assert.match(source, /reports\/external/);
  assert.match(source, /serverFetch<Report\[\]>\(reportPaths\.reports\(\)\)/);
});
