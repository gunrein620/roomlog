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
  assert.match(componentSource, /ticketDashHref\("01",\s*row\.ticket\.id\)/);
  assert.match(componentSource, /조건에 맞는 하자·민원 티켓이 없습니다/);
  assert.match(pageSource, /<ManagerDefectDashboard rows=\{rows\}/);
  assert.match(cssSource, /\/\* manager-defect-dashboard:start \*\//);

  const dashboardCss = cssSource.match(
    /\/\* manager-defect-dashboard:start \*\/[\s\S]*?\/\* manager-defect-dashboard:end \*\//,
  )?.[0];
  assert.ok(dashboardCss);
  assert.doesNotMatch(dashboardCss, /#[\da-f]{3,8}/i);

  assert.doesNotMatch(sidebarSource, /민원 대시보드|민원 대응|하자 관리/);
  assert.equal(
    sha256(sidebarSource),
    "41234fc1e7a78647c95c80805b031994c957f56438e19fe5d994a28097ff31c6",
  );
  assert.equal(
    sha256(navigationSource),
    "916f5fd9a3711a3c704d319467e0dabc6c8596d234e62cb3f42ac5033bff0458",
  );
});
