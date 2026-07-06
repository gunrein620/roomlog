import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "03/page.tsx"), "utf8");
const exportRoutePath = join(__dirname, "03/export/route.ts");
const exportRouteSource = existsSync(exportRoutePath) ? readFileSync(exportRoutePath, "utf8") : "";

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

test("manager report delivery page connects PDF and Excel exports to an export route", () => {
  assert.match(source, /function reportExportHref\(format: "pdf" \| "csv", reportId: string\)/);
  assert.match(source, /reportExportHref\("pdf", report\.id\)/);
  assert.match(source, /reportExportHref\("csv", report\.id\)/);
  assert.doesNotMatch(source, /<Badge>PDF<\/Badge>\s*<Badge>Excel<\/Badge>/);
});

test("manager report export route returns csv and print html formats", () => {
  assert.match(exportRouteSource, /export async function GET/);
  assert.match(exportRouteSource, /getReport\(reportId\)/);
  assert.match(exportRouteSource, /text\/csv/);
  assert.match(exportRouteSource, /text\/html/);
  assert.match(exportRouteSource, /Content-Disposition/);
});
