import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/contract/00/ContractDashboardClient.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  join(process.cwd(), "src/app/manager/contract/00/page.tsx"),
  "utf8",
);

test("contract review dashboard omits the introductory review-queue copy", () => {
  assert.doesNotMatch(source, /오늘 처리해야 할 계약만 먼저 보이는 검토 큐/);
  assert.doesNotMatch(source, /전체 계약 표를 유지하되, 기한 만료·확인 필요·만료 예정 순으로 우선순위를 노출합니다/);
  assert.doesNotMatch(source, /manager-contract-dashboard__hero-copy/);
  assert.doesNotMatch(source, /className="manager-contract-dashboard__hero"/);
  assert.match(source, /className="manager-contract-dashboard__hero-actions"/);
  assert.match(source, /aria-label="계약 검토 대시보드"/);
});

test("contract review dashboard uses only confirmation-based statuses", () => {
  assert.match(pageSource, /title="검토 대시보드"/);
  assert.match(pageSource, /context=\{null\}/);
  assert.match(source, /"상태"/);
  assert.match(source, /"all", "needs_check", "confirmed"/);
  assert.match(source, /review === "confirmed"/);
  assert.match(source, /label: "확정 완료"/);
  assert.match(source, /label: "확인 필요"/);
  assert.match(source, /<DashboardMetric label="확인 필요"/);
  assert.match(source, /<DashboardMetric label="확정 완료"/);

  for (const removedCopy of [
    "우선순위",
    "검토 대기",
    "기한 만료",
    "바로 확정 가능",
    "확정 가능",
    "만료 예정",
    "필터 저장",
    "계약서 검토 큐",
  ]) {
    assert.doesNotMatch(source, new RegExp(removedCopy));
  }

  assert.match(source, /<h3>계약서 검토<\/h3>/);
});
