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
  assert.match(pageSource, /type === "complaint" \|\| type === "defect"/);
  assert.match(pageSource, /initialTemplate === "all"/);
  assert.match(pageSource, /<ComplaintDashboard rows=\{rows\} \/>/);
  assert.match(pageSource, /<ManagerDefectDashboard rows=\{rows\} initialTemplate=\{initialTemplate\}/);
  // 더미 행 혼합 금지 — 대시보드는 실제 접수 티켓만 보여준다(세입자 신규 요청과 직결).
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

  assert.match(sidebarSource, /child\.active \?\? currentHref === child\.href/);
  assert.match(layoutSource, /<ManagerAppShell[\s\S]*?subnav=\{false\}/);
  assert.match(navigationSource, /민원 대시보드/);
  assert.match(navigationSource, /민원 대응/);
  assert.match(navigationSource, /하자 관리/);
  assert.equal(
    sha256(sidebarSource),
    // 2026-07-13 브랜드를 집우집주(WOOZU) 로고+홈 링크로 교체, 접기 토글을 브랜드 왼쪽으로 이동
    "644d549ee8f6eedca8db572d09508c90c81060350f28571f77a869d1017e036f",
  );
  assert.equal(
    sha256(navigationSource),
    "84798e571e84c833346faf928b46cad08dd7c14195c8894e22ac2d59db1bb002",
  );
});
