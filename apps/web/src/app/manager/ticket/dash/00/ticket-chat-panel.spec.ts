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
  assert.match(panelBlock, /width: min\(50vw/);
  assert.match(cssSource, /\.manager-ticket-panel__stream/);
  assert.match(cssSource, /\.manager-ticket-panel__composer/);
});
