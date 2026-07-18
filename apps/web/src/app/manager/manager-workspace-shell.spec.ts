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
  "src/app/manager/vendor-mgmt/layout.tsx",
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
  assert.match(sidebar, /aria-expanded=\{expanded\}/);
  assert.match(sidebar, /aria-controls=\{subnavId\}/);
  assert.match(sidebar, /id=\{isCollapsible \? subnavId : undefined\}/);
  assert.match(sidebar, /item\.id === "ticket"/);
  assert.match(sidebar, /const messagingActive = state\.activeItemId === "messaging"/);
  assert.match(
    sidebar,
    /const \[messagingExpanded, setMessagingExpanded\] = useState\(messagingActive\)/,
  );
  assert.match(sidebar, /const isCollapsible = isTicket \|\| isMessaging/);
  assert.match(sidebar, /const expanded = isTicket \? ticketExpanded : messagingExpanded/);
  assert.match(sidebar, /manager-messaging-subnav/);
  assert.match(sidebar, /const messagingUnreadLabel =/);
  assert.match(sidebar, /aria-label=\{`\$\{item\.label\} 메뉴[\s\S]*?\$\{messagingUnreadLabel\}`\}/);
  assert.match(sidebar, /const showChildren = isCollapsible \? expanded : active/);
  assert.match(
    sidebar,
    /isCollapsible \? \(\s*<button[\s\S]*?className=\{`manager-sidebar__parent-toggle\$\{active \? " is-active" : ""\}`\}[\s\S]*?<Icon aria-hidden="true" \/>[\s\S]*?<span className="manager-sidebar__label">\{item\.label\}<\/span>[\s\S]*?<ChevronDown aria-hidden="true" \/>/,
  );
  assert.match(sidebar, /messagingUnreadCount\?: number/);
  assert.match(sidebar, /ticketUnreadCount\?: number/);
  assert.match(sidebar, /aria-label=\{`미확인 메시지 \$\{messagingUnreadCount\}개`\}/);
  assert.match(sidebar, /aria-label=\{`미확인 민원·하자 \$\{ticketUnreadCount\}개`\}/);
  assert.match(sidebar, /manager-sidebar__unread-badge/);
  assert.match(appShellSource, /useManagerMessagingUnreadCount\(pathname\)/);
  assert.match(appShellSource, /useManagerTicketUnreadCount\(pathname\)/);
  assert.match(appShellSource, /messagingUnreadCount=\{messagingUnreadCount\}/);
  assert.match(appShellSource, /ticketUnreadCount=\{ticketUnreadCount\}/);
  assert.match(managerCss, /manager-sidebar__parent-toggle/);
  assert.doesNotMatch(managerCss, /manager-sidebar__ticket-toggle/);
  assert.match(
    managerCss,
    /\.manager-sidebar__parent-toggle\s*\{[^}]*width:\s*100%;[^}]*display:\s*flex;/,
  );
  assert.match(
    managerCss,
    /\.manager-sidebar__parent-toggle:hover\s*\{[^}]*color:\s*var\(--on-surface\);[^}]*background:\s*var\(--surface-container-high\);/,
  );
  assert.match(sectionNavSource, /item\.children\.map/);
  assert.match(sectionNavSource, /aria-current/);
  assert.match(sectionNavSource, /<span>저장 목록<\/span>/);
  assert.doesNotMatch(sectionNavSource, /<span>임시 저장<\/span>/);
  assert.match(assistant, /showModal\(\)/);
  assert.match(assistant, /aria-label="AI 관리 비서 닫기"/);
  assert.match(assistant, /getBoundingClientRect\(\)/);
  assert.match(assistant, /isDialogBackdropPoint/);
  assert.match(assistant, /AI 상담 모드 선택/);
  assert.match(assistant, /Woo-zu AI 비서/);
  assert.match(assistant, /상담 방식을 선택해 주세요/);
  assert.match(assistant, /Woo-zu AI와 어떻게 대화하시겠어요\?/);
  assert.match(assistant, /텍스트 채팅/);
  assert.match(assistant, /음성 통화/);
  assert.match(assistant, /manager-ai-mode-icon/);
  assert.doesNotMatch(assistant, /Choose your consultation mode/);
  assert.match(assistant, /role="log"/);
  assert.match(assistant, /aria-live="polite"/);
  assert.match(assistant, /ref=\{transcriptRef\}/);
  assert.match(assistant, /onScroll=\{updateTranscriptStickiness\}/);
  assert.match(assistant, /shouldManagerAssistantStickToBottom/);
  assert.match(assistant, /requestAnimationFrame/);
  assert.match(assistant, /cancelAnimationFrame/);
  assert.match(assistant, /scrollTranscriptToBottom/);
  assert.match(assistant, /useManagerAssistantSession/);
  assert.match(assistant, /useManagerRealtimeSession/);
  assert.match(assistant, /session\.submitText/);
  assert.match(assistant, /realtime\.connect/);
  assert.match(assistant, /realtime\.disconnect/);
  assert.match(assistant, /통화 시작/);
  assert.match(assistant, /통화 종료/);
  assert.match(assistant, /Push to Talk/);
  assert.match(assistant, /aria-pressed=\{realtime\.isTalking\}/);
  assert.match(assistant, /onPointerDown=\{startPushToTalk\}/);
  assert.match(assistant, /onPointerUp=\{stopPushToTalk\}/);
  assert.match(assistant, /onPointerCancel=\{stopPushToTalk\}/);
  assert.match(assistant, /onLostPointerCapture=\{stopPushToTalk\}/);
  assert.match(assistant, /onKeyDown=\{startPushToTalkFromKeyboard\}/);
  assert.match(assistant, /onKeyUp=\{stopPushToTalkFromKeyboard\}/);
  assert.match(assistant, /visibilitychange/);
  assert.match(assistant, /ManagerAssistantActionCard/);
  assert.match(assistant, /event\.nativeEvent\.isComposing/);
  assert.match(assistant, /event\.shiftKey/);
  assert.match(appShellSource, /aria-haspopup="dialog"/);
  // 기본 서브내비는 Suspense로 감싼다 — useSearchParams가 정적 프리렌더에서 경계를 요구.
  assert.match(appShellSource, /subnav \?\? <Suspense fallback=\{null\}><ManagerSectionNav \/><\/Suspense>/);
  assert.match(appShellSource, /!fullAssistant/);
  assert.match(appShellSource, /getBoundingClientRect\(\)/);
  assert.match(appShellSource, /isDialogBackdropPoint/);
  assert.match(
    managerCss,
    /\.manager-assistant-dialog\s*\{[^}]*width:\s*min\(calc\(100vw - var\(--space-xxl\)\), calc\(var\(--content-aside-max\) \+ var\(--content-aside-max\)\)\);/,
  );
  assert.match(
    managerCss,
    /\.manager-assistant-dialog__header\s*\{[^}]*color:\s*var\(--on-primary\);[^}]*background:\s*var\(--primary\);/,
  );
  assert.match(managerCss, /\.manager-ai-mode-icon\s*\{/);
  assert.match(managerCss, /\.manager-ai-push-to-talk\s*\{/);
  // useEffect는 사이드바 접힘 상태(localStorage) 복원용.
  assert.match(appShellSource, /import \{ Suspense, useEffect, useRef, useState \} from "react"/);
  // 데스크톱 사이드바에는 접기 토글이 헤더 액션으로 꽂힌다.
  assert.match(
    appShellSource,
    /<Suspense fallback=\{null\}><ManagerSidebar headerAction=\{collapseAction\} messagingUnreadCount=\{messagingUnreadCount\} ticketUnreadCount=\{ticketUnreadCount\} \/><\/Suspense>/,
  );
  assert.match(
    appShellSource,
    /<Suspense fallback=\{null\}><ManagerSidebar onNavigate=\{closeMobileNavigation\} showCloseButton messagingUnreadCount=\{messagingUnreadCount\} ticketUnreadCount=\{ticketUnreadCount\} \/><\/Suspense>/,
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
  const localBorderOverrides = managerCss.match(/^\s*--border:/gm) ?? [];
  assert.equal(localBorderOverrides.length, 1);
  assert.match(
    managerCss,
    /\.manager-workspace\.theme-cosmic \.manager-workspace__sidebar\s*\{[\s\S]*?--border:\s*var\(--cosmic-sidebar-border\);/,
  );
  assert.doesNotMatch(managerCss, /^\s*--shadow:/m);
});

test("every manager desktop domain composes ManagerAppShell", () => {
  for (const file of migratedShellFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /ManagerAppShell/, file);
  }
});

// 홈 콘텐츠는 코스믹 대시보드 한 화면(글랜스). 셸 계약(공용 워크스페이스 사용)은 유지하고,
// 콘텐츠 계약만 갱신한다. AI 브리핑 배너(내장 코파일럿)는 개편에서 제거돼 AI는 공용 플로팅 런처가 담당.
test("manager home composes the cosmic dashboard in the shared workspace", () => {
  const homeSource = readFileSync(managerHomePath, "utf8");
  const overviewSource = existsSync(managerOverviewPath)
    ? readFileSync(managerOverviewPath, "utf8")
    : "";

  assert.match(homeSource, /import \{ ManagerAppShell \}/);
  assert.match(homeSource, /<ManagerAppShell/);
  assert.doesNotMatch(homeSource, /import \{ ManagerShell \}/);
  assert.doesNotMatch(homeSource, /<ManagerShell[\s\n]/);
  assert.match(homeSource, /manager-home-dashboard/);
  // AI 브리핑 배너(CopilotPanel)는 대시보드 개편에서 제거 — AI는 공용 플로팅 런처가 담당.
  assert.doesNotMatch(homeSource, /CopilotPanel/);
  assert.doesNotMatch(homeSource, /hideAssistantLauncher/);
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
