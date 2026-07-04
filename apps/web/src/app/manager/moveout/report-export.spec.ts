import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "01/page.tsx"), "utf8");
const routeSource = readFileSync(join(__dirname, "01/export/route.ts"), "utf8");

test("manager moveout report export actions are connected to an export route", () => {
  assert.match(pageSource, /reportExportHref/);
  assert.match(pageSource, /reportExportHref\("pdf"/);
  assert.match(pageSource, /reportExportHref\("csv"/);
  assert.doesNotMatch(pageSource, /<DisabledButton>PDF 내보내기<\/DisabledButton>/);
  assert.doesNotMatch(pageSource, /<DisabledButton>Excel 내보내기<\/DisabledButton>/);
});

test("manager moveout report export route returns csv and print html formats", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /text\/csv/);
  assert.match(routeSource, /text\/html/);
  assert.match(routeSource, /Content-Disposition/);
});
