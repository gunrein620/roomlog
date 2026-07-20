import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("임대 현황 리포트는 고정 데모 수치 대신 실제 수납액 API와 작동하는 제어를 사용한다", () => {
  const source = readFileSync(join(root, "src/app/manager/home/00/sections/ReportSection.tsx"), "utf8");

  assert.doesNotMatch(source, /REVENUE_DATA|OCCUPANCY_DATA|TICKET_DATA|PDF\/CSV/);
  assert.match(source, /point\.collectedAmount \/ 10_000/);
  assert.match(source, /href="\?reportMonths=6#report"/);
  assert.match(source, /href="\?reportMonths=12#report"/);
  assert.match(source, /\/api\/manager\/rental-report\.csv\?months=\$\{periodMonths\}/);
  assert.doesNotMatch(source, /MANAGER_COST_ROUTES\["M-COST-00"\]|MANAGER_CROSS\.credit/);
  assert.doesNotMatch(source, /실데이터/);
  assert.match(source, /!report \? <span className="manager-report-demo">확인 필요<\/span> : null/);
  assert.doesNotMatch(source, /manager-report-drills|수납 원장 보기|크레딧 원장 보기|계약·입주 현황 보기|민원 원장 보기/);
});
