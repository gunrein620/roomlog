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
const pagePath = join(root, "src/app/manager/ticket/dash/00/page.tsx");
const cssPath = join(root, "src/app/manager/globals.css");
const sidebarPath = join(root, "src/app/manager/_components/ManagerSidebar.tsx");
const navigationPath = join(root, "src/lib/manager-navigation.ts");

const sha256 = (source: string) => createHash("sha256").update(source).digest("hex");

test("manager defect dashboard matches the approved body without changing the sidebar", () => {
  assert.equal(existsSync(componentPath), true, componentPath);

  const componentSource = readFileSync(componentPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
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
    "담당자",
    "건물",
    "템플릿",
  ]) {
    assert.match(componentSource, new RegExp(label));
  }

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
  assert.match(pageSource, /<ManagerDefectDashboard rows=\{rows\}/);
  assert.match(pageSource, /\.\.\.MANAGER_DEFECT_DASHBOARD_DEMO_ROWS/);
  assert.match(componentSource, /disabled/);
  assert.match(componentSource, /row\.buildingName \?\? "—"/);
  assert.match(componentSource, /const buildings/);
  assert.match(cssSource, /\/\* manager-defect-dashboard:start \*\//);
  assert.match(cssSource, /button:disabled/);
  assert.match(cssSource, /manager-defect-dashboard__more-menu-list/);

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

  assert.doesNotMatch(sidebarSource, /민원 대시보드|민원 대응|하자 관리/);
  assert.equal(
    sha256(sidebarSource),
    "41234fc1e7a78647c95c80805b031994c957f56438e19fe5d994a28097ff31c6",
  );
  assert.equal(
    sha256(navigationSource),
    "c23b406f4d043f6bd0d769cb0e4011cd9e3dc09c84064b411c68371021bc089e",
  );
});
