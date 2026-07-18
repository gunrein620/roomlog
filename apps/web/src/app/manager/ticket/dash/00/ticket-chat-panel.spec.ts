import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const panelPath = join(root, "src/app/manager/ticket/dash/00/TicketChatPanel.tsx");
const dashboardPath = join(root, "src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx");
const complaintDashboardPath = join(
  root,
  "src/app/manager/ticket/dash/00/ComplaintDashboard.tsx",
);
const cssPath = join(root, "src/app/manager/globals.css");

test("행 클릭은 모달이 아니라 대화 사이드 패널을 연다", () => {
  assert.equal(existsSync(panelPath), true, panelPath);

  const dashboardSource = readFileSync(dashboardPath, "utf8");
  const complaintDashboardSource = readFileSync(complaintDashboardPath, "utf8");

  for (const source of [dashboardSource, complaintDashboardSource]) {
    assert.match(source, /<TicketChatPanel row=\{selectedRow\}/);
    assert.doesNotMatch(source, /TicketDetailDialog/);
  }

  // 행 전체가 패널을 열되, 액션 메뉴 칸의 클릭은 패널로 새지 않아야 한다.
  assert.match(dashboardSource, /className="manager-defect-dashboard__row"/);
  assert.match(dashboardSource, /onClick=\{\(\) => onSelect\(row\)\}/);
  assert.match(dashboardSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("패널은 티켓 스레드를 세입자와 같은 소스로 읽고 쓴다", () => {
  const panelSource = readFileSync(panelPath, "utf8");

  // 읽기: manager/tickets/:id 의 messages — 세입자 상세(진행 메시지)와 동일한 티켓 스레드.
  assert.match(panelSource, /\/api\/manager\/tickets\/\$\{encodeURIComponent\(ticketId\)\}`/);
  // 쓰기: 관리자 답변 → 같은 스레드에 LANDLORD 메시지로 쌓인다.
  assert.match(panelSource, /\/replies`/);
  assert.match(panelSource, /messageText/);
});

test("패널은 실시간 신호로 갱신되고 폴링으로 폴백한다", () => {
  const panelSource = readFileSync(panelPath, "utf8");

  assert.match(panelSource, /getRealtimeSocket/);
  assert.match(panelSource, /socket\.on\("roomlog:activity", onActivity\)/);
  assert.match(panelSource, /socket\.off\("roomlog:activity", onActivity\)/);
  assert.match(panelSource, /kind === "ticket"/);
  assert.match(panelSource, /window\.setInterval/);
  assert.match(panelSource, /POLL_INTERVAL_MS/);
});

test("패널은 오른쪽 절반을 차지하는 고정 사이드 표면이다", () => {
  const cssSource = readFileSync(cssPath, "utf8");
  const panelBlock = cssSource.match(/\.manager-ticket-panel \{[^}]*\}/)?.[0];

  assert.ok(panelBlock, ".manager-ticket-panel 규칙이 있어야 한다");
  assert.match(panelBlock, /position: fixed/);
  assert.match(panelBlock, /right: 0/);
  // px 상한을 다시 씌우면 넓은 모니터에서 "절반"이 깨진다(1920에서 620px 상한 = 32%).
  // min-width의 min()은 걸리면 안 되므로 width 선언만 떼어내 본다.
  const widthDeclaration = panelBlock.match(/(?:^|\n)\s*width:\s*([^;]+);/)?.[1];
  assert.equal(widthDeclaration, "50vw");
  assert.match(cssSource, /\.manager-ticket-panel__stream/);
  assert.match(cssSource, /\.manager-ticket-panel__composer/);
});

test("진행 상태 토글은 접수·진행·완료 3레인이고 패널 상단 가운데에 놓인다", () => {
  const panelSource = readFileSync(panelPath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");

  assert.match(panelSource, /TICKET_LANES\.map/);
  assert.match(panelSource, /aria-pressed=\{lane === value\}/);
  assert.match(panelSource, /\/lane`/);
  // 읽기 전용 상태 배지는 토글로 대체됐다.
  assert.doesNotMatch(panelSource, /defectDisplayStatus/);

  const laneBlock = cssSource.match(/\.manager-ticket-panel__lanes \{[^}]*\}/)?.[0];
  assert.ok(laneBlock, ".manager-ticket-panel__lanes 규칙이 있어야 한다");
  assert.match(laneBlock, /justify-self: center/);
  assert.match(cssSource, /\.manager-ticket-panel__lanes button\[aria-pressed="true"\]/);
});

test("레인 전환은 낙관적으로 반영하고 실패하면 되돌린다", () => {
  const panelSource = readFileSync(panelPath, "utf8");

  assert.match(panelSource, /const previousLane = lane/);
  assert.match(panelSource, /setLane\(nextLane\)/);
  assert.match(panelSource, /setLane\(previousLane\)/);
});

test("레인 전환 성공은 소켓 왕복을 기다리지 않고 대시보드를 즉시 갱신한다", () => {
  const panelSource = readFileSync(panelPath, "utf8");
  const switchLaneSource = panelSource.match(
    /async function switchLane[\s\S]*?\n  }\n\n  if \(!row/,
  )?.[0];

  assert.match(panelSource, /useRouter/);
  assert.match(panelSource, /const router = useRouter\(\)/);
  assert.ok(switchLaneSource);
  assert.match(switchLaneSource, /const clientRequestId = crypto\.randomUUID\(\)/);
  assert.match(switchLaneSource, /beginLocalTicketLaneMutation\(clientRequestId\)/);
  assert.match(switchLaneSource, /body: JSON\.stringify\(\{ lane: nextLane, clientRequestId \}\)/);
  assert.match(switchLaneSource, /completeLocalTicketLaneMutation\(clientRequestId\)/);
  assert.match(switchLaneSource, /abandonLocalTicketLaneMutation\(clientRequestId\)/);
  assert.match(
    switchLaneSource,
    /if \(!response\.ok\)[\s\S]*throw new Error[\s\S]*router\.refresh\(\)/,
  );
});
