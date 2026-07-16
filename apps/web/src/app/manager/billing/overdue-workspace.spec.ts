import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const componentSource = readFileSync(
  join(root, "src/app/manager/billing/OverdueWorkspace.tsx"),
  "utf8",
);
const styleSource = readFileSync(
  join(root, "src/app/manager/billing/billing-workspace.module.css"),
  "utf8",
);

test("overdue workspace names the list and detail by their actual roles", () => {
  assert.match(componentSource, /독촉 대상/);
  assert.match(componentSource, /연체 상세/);
  assert.match(componentSource, /입금 확인 상세/);
  assert.doesNotMatch(componentSource, /활성 연체|활성 케이스/);
});

test("overdue list and detail keep a visible responsive boundary", () => {
  assert.match(
    styleSource,
    /\.caseList\s*\{[\s\S]*?border-right:\s*1px solid var\(--input-border\);/,
  );
  assert.match(
    styleSource,
    /@media \(max-width: 760px\)[\s\S]*?\.caseList\s*\{[\s\S]*?border-right:\s*0;[\s\S]*?border-bottom:\s*1px solid var\(--input-border\);/,
  );
});

test("billing summaries balance desktop spacing and the overdue search icon stays inside the input", () => {
  assert.match(componentSource, /className=\{styles\.visuallyHidden\}>연체 대상 검색/);
  assert.doesNotMatch(componentSource, /className="sr-only"/);
  assert.match(
    styleSource,
    /\.summaryItem\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?text-align:\s*center;/,
  );
  assert.match(
    styleSource,
    /\.collectionDiagnosisGrid\s*\{[\s\S]*?grid-template-columns:/,
  );
  assert.match(
    styleSource,
    /\.searchIcon\s*\{[\s\S]*?top:\s*50%;[\s\S]*?transform:\s*translateY\(-50%\);/,
  );
});

test("overdue detail keeps actions inside the overdue workflow", () => {
  assert.doesNotMatch(componentSource, /청구 상세|FileText|detailSecondaryLink/);
  assert.match(componentSource, /AI 채팅에서 처리/);
  assert.match(componentSource, /입출금 내역에서 확인/);
  assert.match(
    styleSource,
    /\.detailActions\s*\{[\s\S]*?justify-content:\s*flex-end;/,
  );
});

test("overdue triage exposes factual stages, sorting, and an independently scrolling list", () => {
  assert.match(componentSource, /className=\{styles\.caseListBody\}/);
  assert.match(componentSource, /7일 이내/);
  assert.match(componentSource, /8~30일/);
  assert.match(componentSource, /31일 이상/);
  assert.doesNotMatch(componentSource, /초기 연체|장기 연체|연체 단계/);
  assert.match(componentSource, /연체일 높은 순/);
  assert.match(componentSource, /미수금 많은 순/);
  assert.match(
    styleSource,
    /\.caseListBody\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(
    styleSource,
    /\.caseListBody\s*\{[\s\S]*?scrollbar-gutter:\s*stable;/,
  );
  assert.match(
    styleSource,
    /\.caseWorkspace\s*\{[\s\S]*?height:\s*calc\(var\(--touch-target\) \* 12\);/,
  );
  assert.match(
    styleSource,
    /\.caseList\s*\{[\s\S]*?overflow:\s*hidden;/,
  );
});
