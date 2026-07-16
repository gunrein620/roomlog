import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const managerIndexSource = readFileSync(join(root, "src/app/manager/page.tsx"), "utf8");
const homeTabsSource = readFileSync(join(root, "src/app/manager/home/00/ManagerHomeTabs.tsx"), "utf8");
const layoutPath = join(root, "src/app/manager/agent/layout.tsx");
const realtimePagePath = join(root, "src/app/manager/agent/realtime/page.tsx");
const realtimeConsolePath = join(root, "src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx");
const managerProxyPath = join(root, "src/app/api/manager/[...path]/route.ts");

test("manager root opens the unified dashboard", () => {
  assert.match(managerIndexSource, /redirect\("\/manager\/home\/00"\)/);
  assert.doesNotMatch(managerIndexSource, /redirect\("\/sell"\)/);
});

test("manager realtime prompt is prefilled once and never auto-submitted", () => {
  const pageSource = readFileSync(realtimePagePath, "utf8");
  const consoleSource = readFileSync(realtimeConsolePath, "utf8");
  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /prompt\?: string \| string\[\]/);
  assert.match(pageSource, /billId\?: string \| string\[\]/);
  assert.match(pageSource, /normalizeManagerPrompt/);
  assert.match(pageSource, /normalizeManagerPrompt\(prompt\)/);
  assert.match(pageSource, /initialPrompt=\{initialPrompt\}/);
  assert.match(pageSource, /initialBillId=\{initialBillId\}/);
  assert.match(consoleSource, /initialPrompt\?: string/);
  assert.match(consoleSource, /useState\(\(\) => normalizeManagerPrompt\(initialPrompt\)\)/);
  assert.match(consoleSource, /ManagerAssistantActionCard/);
  assert.match(consoleSource, /requestManagerCopilotChat/);
  assert.doesNotMatch(consoleSource, /useEffect\([^)]*submitAgentMessage/);
});

test("manager home exposes an OpenAI Realtime agent entry point", () => {
  // 워크스페이스 이주 후 진입점은 글로벌 사이드바(manager-navigation)의 "AI 비서" 항목이다.
  const navigationSource = readFileSync(join(root, "src/lib/manager-navigation.ts"), "utf8");
  assert.match(navigationSource, /"AI 비서"/);
  assert.match(navigationSource, /MANAGER_CROSS\.realtimeAgent/);
  assert.match(homeTabsSource, /href=\{realtimeAgentHref\}/);
  assert.match(homeTabsSource, /AI agent/);
  assert.match(homeTabsSource, /실시간 AI 운영 에이전트/);
  assert.match(homeTabsSource, /음성·텍스트로 티켓 처리, 청구 관리, 소통 작업을 진행합니다/);
  assert.doesNotMatch(homeTabsSource, /AI 관리자 준비 중/);
});

test("manager realtime agent route is guarded and renders the initial operation console", () => {
  assert.equal(existsSync(layoutPath), true);
  assert.equal(existsSync(realtimePagePath), true);

  const layoutSource = readFileSync(layoutPath, "utf8");
  const pageSource = readFileSync(realtimePagePath, "utf8");
  const consoleSource = existsSync(realtimeConsolePath)
    ? readFileSync(realtimeConsolePath, "utf8")
    : "";
  const routeSurfaceSource = `${pageSource}\n${consoleSource}`;

  assert.match(layoutSource, /await requireUser\("LANDLORD"\)/);
  assert.match(layoutSource, /ManagerAppShell/);
  assert.match(routeSurfaceSource, /OpenAI Realtime/);
  assert.match(routeSurfaceSource, /음성 연결/);
  assert.match(routeSurfaceSource, /텍스트 명령/);
  assert.match(routeSurfaceSource, /티켓 처리/);
  assert.match(routeSurfaceSource, /청구 관리/);
  assert.match(routeSurfaceSource, /소통/);
});

test("manager realtime route uses a browser console wired to BFF agent APIs", () => {
  assert.equal(existsSync(realtimeConsolePath), true);
  assert.equal(existsSync(managerProxyPath), true);

  const pageSource = readFileSync(realtimePagePath, "utf8");
  const consoleSource = readFileSync(realtimeConsolePath, "utf8");
  const proxySource = readFileSync(managerProxyPath, "utf8");

  assert.match(pageSource, /ManagerRealtimeConsole/);
  assert.match(consoleSource, /"use client"/);
  assert.match(consoleSource, /\/api\/manager\/agent\/realtime\/client-secret/);
  assert.match(consoleSource, /\/api\/manager\/agent\/realtime\/command/);
  assert.match(consoleSource, /new RTCPeerConnection/);
  assert.match(consoleSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(consoleSource, /createDataChannel\("oai-events"\)/);
  assert.match(consoleSource, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
  assert.doesNotMatch(consoleSource, /v1\/realtime\?model/);
  assert.match(consoleSource, /Realtime SDP 교환 실패/);
  assert.match(consoleSource, /parseManagerRealtimeEvent/);
  assert.match(consoleSource, /closeManagerRealtimeResources/);
  assert.match(consoleSource, /ticket\.query/);
  assert.match(consoleSource, /billing\.summary/);
  assert.match(consoleSource, /billing\.send_dunning/);
  assert.match(consoleSource, /messaging\.draft_reply/);
  assert.match(consoleSource, /messaging\.send_reply/);

  assert.match(proxySource, /AUTH_COOKIE/);
  assert.match(proxySource, /apiUrl\(`\/manager\/\$\{path\.join\("\/"\)\}\$\{search\}`/);
  assert.match(proxySource, /Authorization: `Bearer \$\{token\}`/);
});

test("manager realtime text surface is a chat with the agent instead of a command form", () => {
  const consoleSource = readFileSync(realtimeConsolePath, "utf8");

  assert.match(consoleSource, /AI agent와 대화/);
  assert.match(consoleSource, /agentChatShellStyle/);
  assert.match(consoleSource, /agentMessageToCommand/);
  assert.match(consoleSource, /대화 입력/);
  assert.match(consoleSource, /"AI agent에게 처리할 일을 입력하세요"/);
  assert.match(consoleSource, /pendingAction \? "발송 여부를 먼저 확인해 주세요"/);
  assert.match(consoleSource, /"전송"/);
  assert.doesNotMatch(consoleSource, />텍스트 명령</);
  assert.doesNotMatch(consoleSource, />명령 실행</);
});

test("manager realtime chat submits on Enter and keeps Shift Enter for new lines", () => {
  const consoleSource = readFileSync(realtimeConsolePath, "utf8");

  assert.match(consoleSource, /KeyboardEvent/);
  assert.match(consoleSource, /function submitAgentMessageFromKeyboard\(event: KeyboardEvent<HTMLTextAreaElement>\)/);
  assert.match(consoleSource, /event\.key !== "Enter"/);
  assert.match(consoleSource, /event\.shiftKey/);
  assert.match(consoleSource, /event\.nativeEvent\.isComposing/);
  assert.match(consoleSource, /event\.preventDefault\(\)/);
  assert.match(consoleSource, /event\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(consoleSource, /onKeyDown=\{submitAgentMessageFromKeyboard\}/);
});
