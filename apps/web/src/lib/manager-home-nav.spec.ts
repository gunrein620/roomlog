import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "manager-home-nav.ts"), "utf8");

test("manager report cross route is no longer documented as unimplemented", () => {
  assert.match(source, /report:\s*"\/manager\/report\/00"/);
  assert.doesNotMatch(source, /report:\s*"\/manager\/report\/00".*M-RPT\s*\(미구현/);
});
