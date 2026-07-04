import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "02/page.tsx"), "utf8");

test("manager moveout settlement page sends the reviewed settlement to the tenant", () => {
  assert.match(pageSource, /publishSettlementAction/);
  assert.match(pageSource, /publishSettlement/);
  assert.match(pageSource, /name="message"/);
  assert.doesNotMatch(pageSource, /<DisabledButton>임차인에게 전달<\/DisabledButton>/);
});
