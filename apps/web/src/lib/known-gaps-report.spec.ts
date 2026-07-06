import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "../../../../KNOWN-GAPS.md"), "utf8");

test("KNOWN-GAPS does not list remediated report API wiring as still missing", () => {
  assert.doesNotMatch(source, /report \/ vendor-mgmt API 경로\+shape 불일치/);
  assert.doesNotMatch(source, /report는 생성\(POST\) 엔드포인트 자체가 부재/);
  assert.match(source, /KAN-137 리포트/);
  assert.match(source, /리포트 크로스링크 payload/);
});
