import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const copilotSource = readFileSync(join(root, "src/app/manager/home/00/CopilotPanel.tsx"), "utf8");

// 통합 후 계약: 자리표시자가 아니라 실제 CopilotPanel이 대시보드 실데이터로 마운트되고,
// 음성(실시간) 에이전트 진입점은 홈 내비에 유지된다.
test("manager home mounts the AI copilot panel with dashboard data", () => {
  assert.match(pageSource, /data-copilot-slot/);
  assert.match(pageSource, /<CopilotPanel briefingInput=\{dashboard\.briefingInput\}/);
  assert.match(pageSource, /\["AI 관리자", MANAGER_CROSS\.realtimeAgent, false\]/);
  assert.doesNotMatch(pageSource, /통합 예정/);
  assert.doesNotMatch(pageSource, /ManagerHomeTabs/);
});

test("manager home keeps AI available without permanently shrinking the work surface", () => {
  assert.doesNotMatch(pageSource, /DashboardSummary/);
  assert.match(pageSource, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(copilotSource, /<dialog/);
  assert.match(copilotSource, /dialog\.showModal\(\)/);
  assert.match(copilotSource, /AI와 처리하기/);
  assert.doesNotMatch(copilotSource, /position:\s*fixed;[\s\S]*width:\s*min\(510px, 42vw\)/);
});
