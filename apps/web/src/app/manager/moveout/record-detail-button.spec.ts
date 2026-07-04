import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const componentsSource = readFileSync(join(__dirname, "_components.tsx"), "utf8");

test("manager moveout record rows expose detail sections behind a button", () => {
  assert.match(componentsSource, /export function RecordDetailSections/);
  assert.match(componentsSource, /<summary[\s\S]*상세정보 보기/);
  assert.match(componentsSource, /record\.detailSections/);
  assert.match(componentsSource, /section\.items\.map/);
});

test("manager moveout record detail expansion renders source-specific evidence", () => {
  assert.match(componentsSource, /function RecordSourceDetail/);
  assert.match(componentsSource, /record\.detail/);
  assert.match(componentsSource, /record\.detail\?\.chatMessages/);
  assert.match(componentsSource, /record\.detail\?\.media/);
  assert.match(componentsSource, /record\.detail\?\.events/);
  assert.match(componentsSource, /record\.detail\?\.amounts/);
  assert.match(componentsSource, /record\.detail\?\.clauses/);
});
