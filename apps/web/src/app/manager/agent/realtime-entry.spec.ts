import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const homeSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const homeTabsSource = readFileSync(join(root, "src/app/manager/home/00/ManagerHomeTabs.tsx"), "utf8");
const layoutPath = join(root, "src/app/manager/agent/layout.tsx");
const realtimePagePath = join(root, "src/app/manager/agent/realtime/page.tsx");
const realtimeConsolePath = join(root, "src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx");
const managerProxyPath = join(root, "src/app/api/manager/[...path]/route.ts");

test("manager home exposes an OpenAI Realtime agent entry point", () => {
  assert.match(homeSource, /realtimeAgentHref=\{MANAGER_CROSS\.realtimeAgent\}/);
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
  assert.match(layoutSource, /ManagerShell/);
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
  assert.match(consoleSource, /response\.function_call_arguments\.done/);
  assert.match(consoleSource, /ticket\.query/);
  assert.match(consoleSource, /billing\.summary/);
  assert.match(consoleSource, /billing\.send_dunning/);
  assert.match(consoleSource, /messaging\.draft_reply/);
  assert.match(consoleSource, /messaging\.send_reply/);

  assert.match(proxySource, /AUTH_COOKIE/);
  assert.match(proxySource, /apiUrl\(`\/manager\/\$\{path\.join\("\/"\)\}\$\{search\}`/);
  assert.match(proxySource, /Authorization: `Bearer \$\{token\}`/);
});
