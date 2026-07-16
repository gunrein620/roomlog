import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const legacyCopilotPath = join(root, "src/app/manager/home/00/CopilotPanel.tsx");

// 홈은 공용 ManagerAppShell 안에서 렌더된다. 대시보드 상단의 AI 브리핑 배너(CopilotPanel)는
// "한눈에 보이는 대시보드" 개편에서 제거됐고, AI 진입은 다른 관리 화면과 동일하게 공용
// 플로팅 런처가 담당한다. 음성(실시간) 에이전트 진입은 글로벌 사이드바의 "AI 비서" — realtime-entry.spec에서 검증.
test("manager home renders inside the shared workspace shell without the AI briefing banner", () => {
  assert.match(pageSource, /<ManagerAppShell/);
  assert.doesNotMatch(pageSource, /CopilotPanel/);
  assert.doesNotMatch(pageSource, /data-copilot-slot/);
  assert.doesNotMatch(pageSource, /통합 예정/);
  assert.doesNotMatch(pageSource, /ManagerHomeTabs/);
  assert.equal(existsSync(legacyCopilotPath), false);
});

test("manager home keeps AI available via the shared floating launcher", () => {
  assert.doesNotMatch(pageSource, /DashboardSummary/);
  // 홈 내장 코파일럿을 제거했으므로 공용 플로팅 AI 런처를 더 이상 숨기지 않는다.
  assert.doesNotMatch(pageSource, /hideAssistantLauncher/);
});
