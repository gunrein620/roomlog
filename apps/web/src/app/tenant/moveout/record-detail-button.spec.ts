import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "01/page.tsx"), "utf8");

test("tenant moveout timeline exposes record detail sections behind a button", () => {
  assert.match(pageSource, /function RecordDetailSections/);
  assert.match(pageSource, /<summary[\s\S]*상세정보 보기/);
  assert.match(pageSource, /record\.detailSections/);
  assert.match(pageSource, /section\.items\.map/);
});

test("tenant moveout timeline expands source-specific record details", () => {
  assert.match(pageSource, /function RecordSourceDetail/);
  assert.match(pageSource, /record\.detail/);
  assert.match(pageSource, /record\.detail\?\.chatMessages/);
  assert.match(pageSource, /record\.detail\?\.media/);
  assert.match(pageSource, /record\.detail\?\.events/);
  assert.match(pageSource, /record\.detail\?\.amounts/);
  assert.match(pageSource, /record\.detail\?\.clauses/);
});
