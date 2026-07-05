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
const messagingComposeSource = readFileSync(
  join(__dirname, "../app/manager/messaging/01/page.tsx"),
  "utf8",
);
const actionHrefSource = navSource.slice(navSource.indexOf("export function actionHref"));

test("report follow-up actions route to messaging review instead of direct dunning or notice execution", () => {
  assert.doesNotMatch(actionHrefSource, /billing\/dunning/);
  assert.match(navSource, /from "\.\/messaging-manager-nav"/);
  assert.match(actionHrefSource, /MANAGER_MESSAGING_ROUTES\["M-MSG-01"\]/);
  assert.match(actionHrefSource, /new URLSearchParams/);
  assert.match(actionHrefSource, /params\.set\("source", "report"\)/);
  assert.match(actionHrefSource, /params\.set\("actionType", action\.actionType\)/);
  assert.match(actionHrefSource, /params\.set\("unitIds", action\.payload\.unitIds\.join\(","\)\)/);
  assert.match(actionHrefSource, /params\.set\("periodLabel", action\.payload\.periodLabel\)/);
  assert.match(actionHrefSource, /params\.set\("note", action\.payload\.note\)/);
  assert.doesNotMatch(componentsSource, /\{action\.targetScreenId\}로 대상·기간을 넘기고/);
  assert.match(componentsSource, /대상·기간을 넘긴 검토 화면으로 연결/);
  assert.doesNotMatch(faqSource, /billing\/dunning/);
  assert.match(faqSource, /href="\/manager\/messaging\/00"/);
});

test("manager messaging compose reads report follow-up prefill from query params", () => {
  assert.match(messagingComposeSource, /type SearchParams = Promise<\{ id\?: string; source\?: string; actionType\?: "dunning" \| "notice"; unitIds\?: string; billIds\?: string; periodLabel\?: string; note\?: string; title\?: string \}>/);
  assert.match(messagingComposeSource, /const \{ id, source, actionType, unitIds, billIds, periodLabel, note, title \} = await searchParams/);
  assert.match(messagingComposeSource, /applyReportFollowUpPrefill\(draft, \{ source, actionType, unitIds, billIds, periodLabel, note, title \}\)/);
  assert.match(messagingComposeSource, /리포트 후속 조치/);
  assert.match(messagingComposeSource, /발송 전 원본 행을 다시 대조하세요/);
});
