import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const shellSource = readFileSync(join(root, "../../packages/ui/src/components/ManagerShell.tsx"), "utf8");
const tokenSource = readFileSync(join(root, "../../packages/ui/src/tokens.css"), "utf8");
const managerCss = readFileSync(join(root, "src/app/manager/globals.css"), "utf8");
const sidebarPath = join(root, "src/app/manager/_components/ManagerSidebar.tsx");
const sectionNavPath = join(root, "src/app/manager/_components/ManagerSectionNav.tsx");
const assistantPath = join(root, "src/app/manager/_components/ManagerAssistant.tsx");
const appShellPath = join(root, "src/app/manager/_components/ManagerAppShell.tsx");
const appShellSource = readFileSync(appShellPath, "utf8");
const sectionNavSource = readFileSync(sectionNavPath, "utf8");
const navigationSource = readFileSync(join(root, "src/lib/manager-navigation.ts"), "utf8");
const managerHomePath = join(root, "src/app/manager/home/00/page.tsx");
const managerOverviewPath = join(root, "src/app/manager/home/00/ManagerDashboardOverview.tsx");

const migratedShellFiles = [
  "src/app/manager/agent/layout.tsx",
  "src/app/manager/cost/layout.tsx",
  "src/app/manager/messaging/layout.tsx",
  "src/app/manager/moveout/layout.tsx",
  "src/app/manager/report/_components.tsx",
  "src/app/manager/ticket/dash/layout.tsx",
  "src/app/manager/billing/_components.tsx",
  "src/app/manager/contract/_components.tsx",
  "src/app/manager/vendor-mgmt/_components.tsx",
  "src/app/manager/home/_components.tsx",
];

test("manager app shell exposes accessible sidebar and assistant dialogs", () => {
  for (const path of [sidebarPath, sectionNavPath, assistantPath, appShellPath]) {
    assert.equal(existsSync(path), true, path);
  }
  const sidebar = readFileSync(sidebarPath, "utf8");
  const assistant = readFileSync(assistantPath, "utf8");
  assert.match(sidebar, /onNavigate\?:/);
  assert.match(sidebar, /showCloseButton\?:/);
  assert.match(sidebar, /getManagerCurrentHref/);
  assert.match(sidebar, /parentCurrent/);
  assert.match(sidebar, /item\.external/);
  assert.match(sidebar, /관리자 워크스페이스 밖으로 이동/);
  assert.doesNotMatch(sidebar, /target="_blank"/);
  assert.match(sidebar, /aria-expanded=\{ticketExpanded\}/);
  assert.match(sidebar, /aria-controls="manager-ticket-subnav"/);
  assert.match(sidebar, /민원·하자 메뉴 접기/);
  assert.match(sidebar, /민원·하자 메뉴 펼치기/);
  assert.match(sidebar, /id=\{isTicket \? "manager-ticket-subnav" : undefined\}/);
  assert.match(sidebar, /item\.id === "ticket"/);
  assert.match(managerCss, /manager-sidebar__ticket-toggle/);
  assert.match(sectionNavSource, /item\.children\.map/);
  assert.match(sectionNavSource, /aria-current/);
  assert.match(assistant, /showModal\(\)/);
  assert.match(assistant, /aria-label="AI 관리 비서 닫기"/);
  assert.match(assistant, /getBoundingClientRect\(\)/);
  assert.match(assistant, /isDialogBackdropPoint/);
  assert.match(appShellSource, /aria-haspopup="dialog"/);
  assert.match(appShellSource, /subnav \?\? <ManagerSectionNav/);
  assert.match(appShellSource, /!fullAssistant/);
  assert.match(appShellSource, /getBoundingClientRect\(\)/);
  assert.match(appShellSource, /isDialogBackdropPoint/);
  // useEffect는 사이드바 접힘 상태(localStorage) 복원용.
  assert.match(appShellSource, /import \{ Suspense, useEffect, useRef, useState \} from "react"/);
  // 데스크톱 사이드바에는 접기 토글이 헤더 액션으로 꽂힌다.
  assert.match(appShellSource, /<Suspense fallback=\{null\}><ManagerSidebar headerAction=\{collapseAction\} \/><\/Suspense>/);
  assert.match(
    appShellSource,
    /<Suspense fallback=\{null\}><ManagerSidebar onNavigate=\{closeMobileNavigation\} showCloseButton \/><\/Suspense>/,
  );
});

test("manager shell exposes navigation, subnav, actions, and right rail slots", () => {
  for (const prop of ["subnav", "headerActions", "rightRail"]) {
    assert.match(shellSource, new RegExp(`${prop}\\??:`));
  }
  for (const className of ["manager-workspace__sidebar", "manager-workspace__main", "manager-workspace__rail"]) {
    assert.match(shellSource, new RegExp(className));
    assert.match(managerCss, new RegExp(`\\.${className}`));
  }
  assert.doesNotMatch(shellSource, /100vh/);
});

test("manager shell exposes one page heading and token-sized navigation targets", () => {
  assert.match(shellSource, /<h1 className="manager-workspace__title">\{title\}<\/h1>/);
  assert.match(managerCss, /\.manager-workspace__title\s*\{[^}]*margin:\s*0;/);
  assert.match(
    managerCss,
    /\.manager-sidebar__child\s*\{[^}]*min-height:\s*var\(--touch-target\);/,
  );
  assert.match(
    managerCss,
    /\.manager-section-nav a\s*\{[^}]*min-height:\s*var\(--touch-target\);/,
  );
});

test("manager workspace uses canonical tokens without manager-local collisions", () => {
  assert.match(tokenSource, /--manager-sidebar-width:/);
  assert.match(tokenSource, /--manager-assistant-width:/);
  assert.match(tokenSource, /--focus-ring:/);
  assert.doesNotMatch(managerCss, /^\s*--border:/m);
  assert.doesNotMatch(managerCss, /^\s*--shadow:/m);
});

test("every manager desktop domain composes ManagerAppShell", () => {
  for (const file of migratedShellFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /ManagerAppShell/, file);
  }
});

// PR #51: 홈 콘텐츠가 통합 오버뷰 → 코스믹 대시보드+코파일럿으로 교체됨.
// 셸 계약(공용 워크스페이스 사용)은 유지하고, 콘텐츠 계약만 새 구성으로 갱신한다.
// 공용 AI 런처 대신 홈 내장 코파일럿을 쓰는 방향은 PR에서 논의 중 — hideAssistantLauncher가 그 표식.
test("manager home composes the cosmic dashboard in the shared workspace", () => {
  const homeSource = readFileSync(managerHomePath, "utf8");
  const overviewSource = existsSync(managerOverviewPath)
    ? readFileSync(managerOverviewPath, "utf8")
    : "";

  assert.match(homeSource, /import \{ ManagerAppShell \}/);
  assert.match(homeSource, /<ManagerAppShell/);
  assert.doesNotMatch(homeSource, /import \{ ManagerShell \}/);
  assert.doesNotMatch(homeSource, /<ManagerShell[\s\n]/);
  assert.match(homeSource, /hideAssistantLauncher/);
  assert.match(homeSource, /manager-home-dashboard/);
  assert.match(homeSource, /<CopilotPanel briefingInput=\{dashboard\.briefingInput\}/);
  assert.doesNotMatch(homeSource, /function HomeNav/);

  // 통합 오버뷰 산출물은 보존 — 홈 구성 최종안이 결정될 때까지 삭제하지 않는다.
  assert.equal(existsSync(managerOverviewPath), true, managerOverviewPath);
  for (const label of ["미계약 매물", "계약중인 집", "진행 중 티켓", "수납 대기·연체"]) {
    assert.match(overviewSource, new RegExp(label));
  }
});

test("mobile manager surfaces remain outside ManagerAppShell", () => {
  for (const file of ["src/app/manager/vox/layout.tsx", "src/app/manager/ticket/call/layout.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /ManagerAppShell/, file);
  }
});

test("record-bound manager routes stay out of global navigation", () => {
  for (const contextualPath of [
    "/manager/contract/01",
    "/manager/ticket/dash/01",
    "/manager/vendor-mgmt/01",
    "/manager/report/02",
  ]) {
    assert.doesNotMatch(
      navigationSource,
      new RegExp(`href:\\s*["']${contextualPath.replaceAll("/", "\\/")}`),
    );
  }
});
