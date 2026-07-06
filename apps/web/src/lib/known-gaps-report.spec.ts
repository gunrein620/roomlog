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

test("KNOWN-GAPS does not list remediated D20 messaging dunning guard as still missing", () => {
  assert.match(source, /D20 1:1 독촉 금지.*해소/);
  assert.doesNotMatch(source, /- \*\*D20 1:1 독촉 금지\*\*:.*막지 않음/);
  assert.doesNotMatch(source, /payment 컨텍스트 독촉 내용을 막지 않음/);
});
