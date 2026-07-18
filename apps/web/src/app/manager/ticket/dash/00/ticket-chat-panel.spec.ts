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
    assert.match(source, /<TicketChatPanel\s+row=\{selectedRow\}/);
    assert.doesNotMatch(source, /TicketDetailDialog/);
    // 선택은 행 객체가 아니라 티켓 id로 들고 최신 rows에서 되찾는다.
    // 행 객체를 state에 담아두면 RSC 새로고침이 도착할 때 패널이 닫히거나 옛 상태로 되돌아간다.
    assert.match(source, /useState<string \| null>\(null\)/);
    assert.match(source, /effectiveRows\.find\(\(row\) => row\.ticket\.id === selectedTicketId\)/);
    assert.doesNotMatch(source, /setSelectedRow/);
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

test("패널은 쓰기 뒤 스레드를 재조회하지 않는다", () => {
  const panelSource = readFileSync(panelPath, "utf8");

  // 쓰기 직후 재조회는 Postgres 투영이 따라오기 전이라 "한 박자 밀린" 스레드를 돌려줬다.
  // 상대 메시지는 소켓 페이로드로, 내 메시지는 POST 응답으로 붙인다.
  assert.match(panelSource, /getRealtimeSocket/);
  assert.match(panelSource, /socket\.on\("roomlog:ticket-message", onTicketMessage\)/);
  assert.match(panelSource, /socket\.off\("roomlog:ticket-message", onTicketMessage\)/);
  assert.match(panelSource, /appendTicketMessage\(current, message\)/);
  assert.match(panelSource, /appendTicketMessage\(current, sent\)/);

  // 재조회 헬퍼는 최초 적재에서만 쓰인다.
  assert.equal(panelSource.match(/fetchTicketMessages\(/g)?.length, 2);
  assert.doesNotMatch(panelSource, /refresh\(\{ silent/);
  assert.doesNotMatch(panelSource, /window\.setInterval/);
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

test("레인 전환은 서버가 확인한 상태로 맞추고 목록도 갱신한다", () => {
  const panelSource = readFileSync(panelPath, "utf8");
  const switchLaneSource = panelSource.match(
    /async function switchLane[\s\S]*?\n  }\n\n  if \(!row/,
  )?.[0];

  assert.ok(switchLaneSource);
  assert.match(switchLaneSource, /body: JSON\.stringify\(\{ lane: nextLane \}\)/);
  assert.match(switchLaneSource, /ticketLaneFromServerStatus\(data\?\.ticket\?\.status\) \?\? nextLane/);

  // 목록 배지는 콜백으로 그 자리에서 바꾼다. router.refresh()는 서버 트리를 다시 그려
  // 패널을 닫아버리므로 쓰지 않는다 — 상태는 목록 맨 왼쪽 열에 이미 보인다.
  assert.match(switchLaneSource, /onLaneChange\?\.\(ticketId, confirmed\)/);
  assert.doesNotMatch(panelSource, /router\.refresh\(\)/);
  assert.doesNotMatch(panelSource, /useRouter/);

  // 낙관적 상태를 지키려고 두던 clientRequestId 추적은 걷어냈다 —
  // 읽기 저장소가 밀린 쓰기를 기다리므로 새로고침이 옛 상태를 되돌려주지 않는다.
  assert.doesNotMatch(panelSource, /clientRequestId/);
  assert.doesNotMatch(panelSource, /LocalTicketLaneMutation/);
});
