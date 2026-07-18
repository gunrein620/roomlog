import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const componentPath = join(
  root,
  "src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx",
);
const actionMenuPath = join(
  root,
  "src/app/manager/ticket/dash/00/TicketActionMenu.tsx",
);
const complaintDashboardPath = join(
  root,
  "src/app/manager/ticket/dash/00/ComplaintDashboard.tsx",
);
const pagePath = join(root, "src/app/manager/ticket/dash/00/page.tsx");
const autoRefreshPath = join(
  root,
  "src/app/manager/ticket/dash/00/TicketDashboardAutoRefresh.tsx",
);
const ticketDetailDialogPath = join(
  root,
  "src/app/manager/ticket/dash/00/TicketDetailDialog.tsx",
);
const layoutPath = join(root, "src/app/manager/ticket/dash/layout.tsx");
const cssPath = join(root, "src/app/manager/globals.css");
const sidebarPath = join(root, "src/app/manager/_components/ManagerSidebar.tsx");
const navigationPath = join(root, "src/lib/manager-navigation.ts");

const sha256 = (source: string) => createHash("sha256").update(source).digest("hex");

test("manager defect dashboard matches the approved body with the ticket sidebar tabs", () => {
  assert.equal(existsSync(componentPath), true, componentPath);
  assert.equal(existsSync(actionMenuPath), true, actionMenuPath);
  assert.equal(existsSync(complaintDashboardPath), true, complaintDashboardPath);

  const componentSource = readFileSync(componentPath, "utf8");
  const actionMenuSource = readFileSync(actionMenuPath, "utf8");
  const complaintDashboardSource = readFileSync(complaintDashboardPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  assert.equal(existsSync(autoRefreshPath), true, autoRefreshPath);
  const autoRefreshSource = readFileSync(autoRefreshPath, "utf8");
  const ticketDetailDialogSource = readFileSync(ticketDetailDialogPath, "utf8");
  const layoutSource = readFileSync(layoutPath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");
  const sidebarSource = readFileSync(sidebarPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  for (const label of [
    "하자 관리",
    "전체",
    "대기",
    "진행중",
    "완료",
    "취소",
    "정기점검",
    "유형",
    "담당자",
    "건물",
  ]) {
    assert.match(componentSource, new RegExp(label));
  }

  assert.doesNotMatch(componentSource, /<span>템플릿<\/span>/);
  assert.ok(
    componentSource.indexOf('htmlFor="manager-defect-template"') <
      componentSource.indexOf('htmlFor="manager-defect-worker"'),
  );

  for (const column of [
    "유형",
    "작업명",
    "건물",
    "호실",
    "작업자",
    "예정일시",
    "상태",
    "작업",
  ]) {
    assert.match(componentSource, new RegExp(column));
  }

  // 청구 금액은 목록에서 뺐다 — 금액은 결제·비용 승인 화면에서만 다룬다.
  assert.doesNotMatch(componentSource, /청구 금액/);
  assert.doesNotMatch(componentSource, /formatDefectMoney/);

  assert.match(componentSource, /aria-pressed/);
  assert.match(componentSource, /ticketLaneOf/);
  // 레인 오버라이드 맵은 걷어냈다 — 읽기 저장소가 밀린 쓰기를 기다리므로 서버 행이 곧 진실이다.
  assert.doesNotMatch(componentSource, /LaneOverride/);
  assert.match(componentSource, /received: "접수"/);
  assert.match(componentSource, /processing: "진행"/);
  assert.match(componentSource, /resolved: "완료"/);
  assert.doesNotMatch(componentSource, /defectDisplayStatus/);
  assert.doesNotMatch(componentSource, /업체 선정/);
  assert.doesNotMatch(componentSource, /미완료/);
  assert.match(cssSource, /data-status="received"/);
  assert.match(cssSource, /data-status="processing"/);
  assert.match(cssSource, /data-status="resolved"/);
  assert.match(actionMenuSource, /ticketDashHref\("01",\s*ticketId\)/);
  assert.match(actionMenuSource, /ticketDashHref\("04",\s*ticketId\)/);
  assert.match(actionMenuSource, /ticketDashHref\("05",\s*ticketId\)/);
  assert.match(componentSource, /<TicketActionMenu/);
  assert.doesNotMatch(componentSource, /<details/);
  assert.doesNotMatch(componentSource, /<summary/);
  assert.match(actionMenuSource, /createPortal/);
  assert.match(actionMenuSource, /placeTicketActionMenu/);
  assert.match(actionMenuSource, /aria-haspopup="menu"/);
  assert.match(actionMenuSource, /aria-expanded=\{open\}/);
  assert.match(actionMenuSource, /event\.key === "Escape"/);
  assert.match(actionMenuSource, /pointerdown/);
  assert.match(actionMenuSource, /addEventListener\("scroll"/);
  assert.match(actionMenuSource, /addEventListener\("resize"/);
  assert.doesNotMatch(componentSource, /manager-defect-dashboard__primary-action/);
  assert.doesNotMatch(componentSource, />\s*정보입력\s*</);
  assert.match(actionMenuSource, /상세·정보입력/);
  assert.match(actionMenuSource, /업체 선정·견적/);
  assert.match(actionMenuSource, /결제·비용 승인/);
  assert.doesNotMatch(componentSource, /박지훈/);
  assert.doesNotMatch(componentSource, /row\.isDemo/);
  assert.doesNotMatch(componentSource, /더미 작업 비활성/);
  assert.match(componentSource, /조건에 맞는 하자·민원 티켓이 없습니다/);
  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /resolveTicketDashboardView/);
  assert.match(pageSource, /headers\(\)/);
  assert.match(pageSource, /appendLocalTicketDemoRows/);
  assert.match(pageSource, /<ComplaintDashboard rows=\{rows\} \/>/);
  assert.match(
    pageSource,
    /dashboardView === "dashboard"[\s\S]*<TicketDashboardAutoRefresh \/>[\s\S]*<ComplaintDashboard rows=\{rows\} \/>/,
  );
  const managerDashboardRender = pageSource.match(
    /<ManagerDefectDashboard[\s\S]*?\/>/,
  )?.[0];
  assert.ok(managerDashboardRender);
  assert.match(managerDashboardRender, /rows=\{rows\}/);
  assert.match(managerDashboardRender, /initialTemplate=\{initialTemplate\}/);
  assert.match(managerDashboardRender, /proxyIntakeRooms=\{proxyIntakeRooms\}/);
  assert.match(autoRefreshSource, /getRealtimeSocket/);
  assert.match(autoRefreshSource, /shouldRefreshTicketDashboard/);
  assert.match(autoRefreshSource, /router\.refresh\(\)/);
  assert.match(autoRefreshSource, /socket\.on\("roomlog:activity", onActivity\)/);
  assert.match(autoRefreshSource, /socket\.off\("roomlog:activity", onActivity\)/);
  assert.match(autoRefreshSource, /refreshGateRef/);
  assert.match(autoRefreshSource, /refreshGateRef\.current\.request/);
  assert.match(autoRefreshSource, /refreshGateRef\.current\.flush/);
  // 레인 브로드캐스트는 별도 이벤트(roomlog:ticket-lane)라 대시보드 새로고침을 건드리지 않는다.
  assert.doesNotMatch(autoRefreshSource, /LocalTicketLaneMutation/);
  assert.match(autoRefreshSource, /queueMicrotask\(flushPendingRefresh\)/);
  assert.match(autoRefreshSource, /addEventListener\("focusout", flushAfterFocusSettles\)/);
  assert.match(autoRefreshSource, /addEventListener\("visibilitychange", flushPendingRefresh\)/);
  assert.match(autoRefreshSource, /removeEventListener\("focusout", flushAfterFocusSettles\)/);
  assert.match(autoRefreshSource, /removeEventListener\("visibilitychange", flushPendingRefresh\)/);
  assert.doesNotMatch(autoRefreshSource, /window\.setInterval/);
  assert.doesNotMatch(autoRefreshSource, /addEventListener\("focus"/);
  assert.doesNotMatch(autoRefreshSource, /socket\.on\("connect"/);
  assert.doesNotMatch(autoRefreshSource, /socket\.on\("disconnect"/);
  assert.match(
    pageSource,
    /dashboardView === "management"[\s\S]*<TicketDashboardAutoRefresh/,
  );
  // 과거 추적 데모 상수는 사용하지 않고, Git 비추적 로컬 파일만 서버 로더로 추가한다.
  assert.doesNotMatch(pageSource, /MANAGER_DEFECT_DASHBOARD_DEMO_ROWS/);
  assert.match(pageSource, /listManagerTicketRows/);
  assert.match(componentSource, /initialTemplate/);
  assert.match(componentSource, /markManagerTicketRead/);
  assert.match(componentSource, /void markManagerTicketRead\(row\.ticket\.id\)/);
  assert.match(
    componentSource,
    /data-unread=\{row\.isManagerUnread \? "true" : undefined\}/,
  );
  assert.match(componentSource, />미확인<\/span>/);
  assert.match(
    componentSource,
    /markManagerTicketRead\(row\.ticket\.id\)[\s\S]*setLocallyReadTicketIds/,
  );
  assert.match(cssSource, /manager-defect-dashboard__unread-badge/);
  assert.match(cssSource, /tr\[data-unread="true"\]/);
  assert.match(componentSource, /disabled/);
  assert.match(componentSource, /row\.buildingName \?\? "—"/);
  assert.match(componentSource, /const buildings/);
  assert.match(cssSource, /\/\* manager-defect-dashboard:start \*\//);
  assert.match(cssSource, /button:disabled/);
  assert.match(cssSource, /manager-defect-dashboard__more-menu-list/);
  assert.doesNotMatch(
    cssSource,
    /manager-defect-dashboard__table tbody tr:nth-last-child\(-n \+ 3\)/,
  );
  assert.match(complaintDashboardSource, /보고서 다운로드/);
  assert.match(complaintDashboardSource, /민원\/하자 대시보드/);
  assert.match(complaintDashboardSource, /전체 접수/);
  assert.match(complaintDashboardSource, /최근 민원\/하자 접수 내역/);
  assert.match(complaintDashboardSource, /aria-label="이전 달"/);
  assert.match(complaintDashboardSource, /\?view=management/);
  assert.match(complaintDashboardSource, /aria-label="조회 월 선택"/);
  assert.match(complaintDashboardSource, /role="dialog"/);
  assert.match(complaintDashboardSource, /aria-label="조회 연월 선택"/);
  assert.match(complaintDashboardSource, /Array\.from\(\{ length: 12 \}/);
  assert.match(complaintDashboardSource, /setPickerYear\(\(year\) => year - 1\)/);
  assert.match(complaintDashboardSource, /setPickerYear\(\(year\) => year \+ 1\)/);
  assert.match(
    complaintDashboardSource,
    /setMonth\(new Date\(Date\.UTC\(pickerYear, monthIndex, 1, 12\)\)\)/,
  );
  assert.doesNotMatch(complaintDashboardSource, /calendar-weekdays|calendar-days|setSelectedDate/);
  assert.match(complaintDashboardSource, /event\.key === "Escape"/);
  assert.match(cssSource, /\/\* manager-complaint-dashboard:start \*\//);
  assert.match(cssSource, /manager-complaint-dashboard__calendar-popover/);
  assert.match(ticketDetailDialogSource, /row\.attachmentUrls/);
  assert.match(ticketDetailDialogSource, /manager-ticket-dialog__attachments/);
  assert.match(ticketDetailDialogSource, /manager-ticket-dialog__attachment-thumbnail/);
  assert.match(ticketDetailDialogSource, /manager-ticket-image-preview/);
  assert.match(ticketDetailDialogSource, /aria-modal="true"/);
  assert.match(ticketDetailDialogSource, /event\.key === "Escape"/);
  assert.match(ticketDetailDialogSource, /onError/);
  assert.match(ticketDetailDialogSource, /markAttachmentFailed\(selectedAttachmentUrl\)/);
  assert.match(ticketDetailDialogSource, /target="_blank"/);
  assert.match(cssSource, /manager-ticket-dialog__attachment-thumbnail/);
  assert.match(cssSource, /manager-ticket-image-preview/);

  const dashboardCss = cssSource.match(
    /\/\* manager-defect-dashboard:start \*\/[\s\S]*?\/\* manager-defect-dashboard:end \*\//,
  )?.[0];
  assert.ok(dashboardCss);
  assert.match(
    dashboardCss,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(
    dashboardCss,
    /manager-defect-dashboard__pagination\s*>\s*span[\s\S]*?grid-column:\s*1/,
  );
  assert.match(
    dashboardCss,
    /manager-defect-dashboard__pagination nav[\s\S]*?grid-column:\s*2[\s\S]*?justify-self:\s*center/,
  );
  assert.doesNotMatch(dashboardCss, /#[\da-f]{3,8}/i);

  assert.match(sidebarSource, /child\.ticketView/);
  assert.match(layoutSource, /<ManagerAppShell[\s\S]*?subnav=\{false\}/);
  assert.match(navigationSource, /민원 대시보드/);
  assert.match(navigationSource, /민원\/하자 관리/);
  assert.doesNotMatch(navigationSource, /label: "민원 대응"/);
  assert.doesNotMatch(navigationSource, /label: "하자 관리"/);
  assert.match(componentSource, /"민원\/하자 관리"/);
  assert.equal(
    sha256(sidebarSource),
    // 2026-07-16: 민원·하자 미확인 배지와 접근성 레이블을 사이드바에 추가.
    "6105a849a871ec677cb1173d1c57b9006b1c087a71bc240d0f63bd08f1144a20",
  );
  assert.equal(
    sha256(navigationSource),
    // 2026-07-16 kms-manager-chat 기준 티켓 내비게이션 소스.
    "6757c4f9932ccb15dbe875350c2caf42faeb16f054dffe5d16ee88a5b900c775",
  );
});
