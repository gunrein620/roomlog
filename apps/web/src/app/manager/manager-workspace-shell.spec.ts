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

test("manager app shell exposes accessible sidebar and assistant dialogs", () => {
  for (const path of [sidebarPath, sectionNavPath, assistantPath, appShellPath]) {
    assert.equal(existsSync(path), true, path);
  }
  const sidebar = readFileSync(sidebarPath, "utf8");
  const sectionNav = readFileSync(sectionNavPath, "utf8");
  const assistant = readFileSync(assistantPath, "utf8");
  const appShell = readFileSync(appShellPath, "utf8");
  assert.match(sidebar, /onNavigate\?:/);
  assert.match(sidebar, /showCloseButton\?:/);
  assert.match(sidebar, /getManagerCurrentHref/);
  assert.match(sidebar, /parentCurrent/);
  assert.match(sidebar, /item\.external/);
  assert.match(sidebar, /관리자 워크스페이스 밖으로 이동/);
  assert.doesNotMatch(sidebar, /target="_blank"/);
  assert.match(sectionNav, /aria-current/);
  assert.match(assistant, /showModal\(\)/);
  assert.match(assistant, /aria-label="AI 관리 비서 닫기"/);
  assert.match(assistant, /getBoundingClientRect\(\)/);
  assert.match(assistant, /isDialogBackdropPoint/);
  assert.match(appShell, /aria-haspopup="dialog"/);
  assert.match(appShell, /<ManagerSectionNav/);
  assert.match(appShell, /!fullAssistant/);
  assert.match(appShell, /getBoundingClientRect\(\)/);
  assert.match(appShell, /isDialogBackdropPoint/);
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

test("manager workspace uses canonical tokens without manager-local collisions", () => {
  assert.match(tokenSource, /--manager-sidebar-width:/);
  assert.match(tokenSource, /--manager-assistant-width:/);
  assert.match(tokenSource, /--focus-ring:/);
  assert.doesNotMatch(managerCss, /^\s*--border:/m);
  assert.doesNotMatch(managerCss, /^\s*--shadow:/m);
});
