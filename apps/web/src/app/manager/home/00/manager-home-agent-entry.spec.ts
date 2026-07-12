import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const copilotSource = readFileSync(join(root, "src/app/manager/home/00/CopilotPanel.tsx"), "utf8");

// 워크스페이스 이주 후 계약: 홈은 공용 ManagerAppShell 안에서 CopilotPanel을
// 대시보드 실데이터로 마운트한다. 음성(실시간) 에이전트 진입은 글로벌 사이드바
// (manager-navigation의 "AI 비서")가 담당 — realtime-entry.spec에서 검증.
test("manager home mounts the AI copilot panel with dashboard data", () => {
  assert.match(pageSource, /data-copilot-slot/);
  assert.match(pageSource, /<CopilotPanel briefingInput=\{dashboard\.briefingInput\}/);
  assert.match(pageSource, /<ManagerAppShell/);
  assert.doesNotMatch(pageSource, /통합 예정/);
  assert.doesNotMatch(pageSource, /ManagerHomeTabs/);
});

test("manager home keeps AI available without permanently shrinking the work surface", () => {
  assert.doesNotMatch(pageSource, /DashboardSummary/);
  // 홈 자체 코파일럿이 있으므로 공용 플로팅 AI 런처는 홈에서만 숨긴다 (AI 표면 통일은 PR 논의).
  assert.match(pageSource, /hideAssistantLauncher/);
  assert.match(copilotSource, /<dialog/);
  assert.match(copilotSource, /dialog\.showModal\(\)/);
  assert.match(copilotSource, /AI와 처리하기/);
  assert.doesNotMatch(copilotSource, /position:\s*fixed;[\s\S]*width:\s*min\(510px, 42vw\)/);
});
