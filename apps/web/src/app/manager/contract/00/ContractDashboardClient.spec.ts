import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/contract/00/ContractDashboardClient.tsx"),
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
