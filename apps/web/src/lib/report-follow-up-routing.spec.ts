import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const navSource = readFileSync(join(__dirname, "report-nav.ts"), "utf8");
const componentsSource = readFileSync(
  join(__dirname, "../app/manager/report/_components.tsx"),
  "utf8",
);
const faqSource = readFileSync(join(__dirname, "../app/manager/report/05/page.tsx"), "utf8");
const actionHrefSource = navSource.slice(navSource.indexOf("export function actionHref"));

test("report follow-up actions route to messaging review instead of direct dunning or notice execution", () => {
  assert.doesNotMatch(actionHrefSource, /billing\/dunning/);
  assert.match(actionHrefSource, /return "\/manager\/messaging\/00"/);
  assert.doesNotMatch(componentsSource, /\{action\.targetScreenId\}로 대상·기간을 넘기고/);
  assert.match(componentsSource, /메시징 초안으로 연결/);
  assert.doesNotMatch(faqSource, /billing\/dunning/);
  assert.match(faqSource, /href="\/manager\/messaging\/00"/);
});
