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
const complaintDashboardPath = join(
  root,
  "src/app/manager/ticket/dash/00/ComplaintDashboard.tsx",
);
const pagePath = join(root, "src/app/manager/ticket/dash/00/page.tsx");
const autoRefreshPath = join(
  root,
  "src/app/manager/ticket/dash/00/TicketDashboardAutoRefresh.tsx",
);
const layoutPath = join(root, "src/app/manager/ticket/dash/layout.tsx");
const cssPath = join(root, "src/app/manager/globals.css");
const sidebarPath = join(root, "src/app/manager/_components/ManagerSidebar.tsx");
const navigationPath = join(root, "src/lib/manager-navigation.ts");

const sha256 = (source: string) => createHash("sha256").update(source).digest("hex");

test("manager defect dashboard matches the approved body with the ticket sidebar tabs", () => {
  assert.equal(existsSync(componentPath), true, componentPath);
  assert.equal(existsSync(complaintDashboardPath), true, complaintDashboardPath);

  const componentSource = readFileSync(componentPath, "utf8");
  const complaintDashboardSource = readFileSync(complaintDashboardPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  assert.equal(existsSync(autoRefreshPath), true, autoRefreshPath);
  const autoRefreshSource = readFileSync(autoRefreshPath, "utf8");
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
    "청구 금액",
    "상태",
    "작업",
  ]) {
    assert.match(componentSource, new RegExp(column));
  }

  assert.match(componentSource, /aria-pressed/);
  assert.match(componentSource, /defectDisplayStatus/);
  assert.match(componentSource, /업체 선정/);
  assert.match(componentSource, /미완료/);
  assert.match(componentSource, /ticketDashHref\("01",\s*row\.ticket\.id\)/);
  assert.match(componentSource, /ticketDashHref\("04",\s*row\.ticket\.id\)/);
  assert.match(componentSource, /ticketDashHref\("05",\s*row\.ticket\.id\)/);
  assert.match(componentSource, /<details/);
  assert.match(componentSource, /<summary/);
  assert.doesNotMatch(componentSource, /manager-defect-dashboard__primary-action/);
  assert.doesNotMatch(componentSource, />\s*정보입력\s*</);
  assert.match(componentSource, /상세·정보입력/);
  assert.match(componentSource, /업체 선정·견적/);
  assert.match(componentSource, /결제·비용 승인/);
  assert.doesNotMatch(componentSource, /박지훈/);
  assert.doesNotMatch(componentSource, /row\.isDemo/);
  assert.doesNotMatch(componentSource, /더미 작업 비활성/);
  assert.match(componentSource, /조건에 맞는 하자·민원 티켓이 없습니다/);
  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /resolveTicketDashboardView/);
  assert.match(pageSource, /headers\(\)/);
  assert.match(pageSource, /appendLocalTicketDemoRows/);
  assert.match(pageSource, /<ComplaintDashboard rows=\{rows\} \/>/);
  assert.match(pageSource, /<ManagerDefectDashboard rows=\{rows\} initialTemplate=\{initialTemplate\}/);
  assert.match(autoRefreshSource, /getRealtimeSocket/);
  assert.match(autoRefreshSource, /isTicketActivity/);
  assert.match(autoRefreshSource, /router\.refresh\(\)/);
  assert.match(autoRefreshSource, /window\.setInterval/);
  assert.match(autoRefreshSource, /30000/);
  assert.match(autoRefreshSource, /visibilitychange/);
  assert.match(
    pageSource,
    /dashboardView === "management"[\s\S]*<TicketDashboardAutoRefresh/,
  );
  // 과거 추적 데모 상수는 사용하지 않고, Git 비추적 로컬 파일만 서버 로더로 추가한다.
  assert.doesNotMatch(pageSource, /MANAGER_DEFECT_DASHBOARD_DEMO_ROWS/);
  assert.match(pageSource, /listManagerTicketRows/);
  assert.match(componentSource, /initialTemplate/);
  assert.match(componentSource, /disabled/);
  assert.match(componentSource, /row\.buildingName \?\? "—"/);
  assert.match(componentSource, /const buildings/);
  assert.match(cssSource, /\/\* manager-defect-dashboard:start \*\//);
  assert.match(cssSource, /button:disabled/);
  assert.match(cssSource, /manager-defect-dashboard__more-menu-list/);
  assert.match(complaintDashboardSource, /보고서 다운로드/);
  assert.match(complaintDashboardSource, /최근 민원 접수 내역/);
  assert.match(complaintDashboardSource, /aria-label="이전 달"/);
  assert.match(complaintDashboardSource, /\?type=complaint/);
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
    // 2026-07-14 통합 대시보드 하위 탭(리포트·건물 관리·등록)에 스크롤스파이 활성 표시 추가 —
    // 해시 섹션을 스크롤 위치로 추적해 사이드바 하이라이트를 동기화(자산현황=최상단).
    "d7c065a39db073660260a027a32b0d58c7f5abb0242c5b4d2ae9df49032b4f00",
  );
  assert.equal(
    sha256(navigationSource),
    // 2026-07-13 대시보드 탭 통합 — "미처리 업무" 자식 제거, 리포트·건물 관리·등록 탭을
    // /manager/home/00#report 등 페이지 내 앵커 링크로 전환(별도 페이지를 홈에 통합).
    // dev 머지: 티켓 자식의 typeFilter → ticketView 개편과 합쳐진 소스 기준 해시.
    "b0e6fc7ae52524f29faa1380ace537b7ca015a7b329dbb70e64b7e2349ffd188",
  );
});
