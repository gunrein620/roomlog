"use client";

import type { MouseEvent, ReactNode } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ManagerShell } from "@roomlog/ui";
import {
  isDialogBackdropPoint,
  type ManagerAssistantBriefingItem,
} from "@/lib/manager-assistant";
import { ManagerAssistantLauncher, ManagerAssistantPanel } from "./ManagerAssistant";
import { ManagerSectionNav } from "./ManagerSectionNav";
import { ManagerSidebar } from "./ManagerSidebar";

export interface ManagerAppShellProps {
  title: ReactNode;
  context?: ReactNode;
  subnav?: ReactNode;
  managerName?: string;
  showAssistantRail?: boolean;
  assistantBriefing?: readonly ManagerAssistantBriefingItem[];
  /** 화면이 자체 AI 표면(예: 홈 코파일럿)을 내장할 때 플로팅 AI 비서 런처를 숨긴다. 기본값은 기존 동작 유지. */
  hideAssistantLauncher?: boolean;
  /** 워크스페이스 테마(packages/ui tokens.css의 .theme-*). 관리 화면 전체를 코스믹(심야 우주)으로 통일 —
   *  기본값 "cosmic". 특정 화면만 v1(라이트)로 되돌리려면 theme={undefined}를 명시적으로 넘긴다. */
  theme?: "cosmic";
  children: ReactNode;
}

export function ManagerAppShell({
  title,
  context,
  subnav,
  managerName,
  showAssistantRail = false,
  assistantBriefing = [],
  hideAssistantLauncher = false,
  theme = "cosmic",
  children,
}: ManagerAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const fullAssistant = pathname.startsWith("/manager/agent/realtime");

  // 접힘 상태는 화면(레이아웃) 간 이동에도 유지 — SSR 불일치를 피하려고 마운트 후에 복원한다.
  useEffect(() => {
    try {
      setNavCollapsed(window.localStorage.getItem("manager-nav-collapsed") === "1");
    } catch {
      // localStorage 접근 불가(사파리 시크릿 등) — 기본 펼침 유지
    }
  }, []);

  function toggleNavCollapsed() {
    const next = !navCollapsed;
    setNavCollapsed(next);
    try {
      window.localStorage.setItem("manager-nav-collapsed", next ? "1" : "0");
    } catch {
      // 저장 실패해도 이번 세션 토글은 동작
    }
  }

  function openMobileNavigation() {
    mobileDialogRef.current?.showModal();
    setMobileOpen(true);
  }

  function closeMobileNavigation() {
    mobileDialogRef.current?.close();
    setMobileOpen(false);
  }

  function closeMobileNavigationOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (isDialogBackdropPoint(event, bounds)) closeMobileNavigation();
  }

  const action = (
    <button
      type="button"
      className="manager-mobile-menu"
      aria-label="관리자 메뉴 열기"
      aria-haspopup="dialog"
      aria-controls="manager-mobile-nav-dialog"
      aria-expanded={mobileOpen}
      onClick={openMobileNavigation}
    >
      <Menu aria-hidden="true" />
    </button>
  );
  // 접기 토글은 사이드바 우측 상단(브랜드 옆)에 상주 — 색은 사이드바 토큰을 따라간다.
  const collapseAction = (
    <button
      type="button"
      className="manager-nav-collapse"
      aria-label="사이드바 접기"
      onClick={toggleNavCollapsed}
    >
      <PanelLeftClose aria-hidden="true" />
    </button>
  );
  const rail = showAssistantRail ? (
    <ManagerAssistantPanel
      managerName={managerName}
      contextLabel="통합 대시보드"
      briefing={assistantBriefing}
    />
  ) : undefined;

  return (
    <>
      <ManagerShell
        title={title}
        context={context}
        navCollapsed={navCollapsed}
        theme={theme}
        nav={<Suspense fallback={null}><ManagerSidebar headerAction={collapseAction} /></Suspense>}
        subnav={subnav ?? <ManagerSectionNav />}
        headerActions={action}
        rightRail={rail}
      >
        {children}
      </ManagerShell>
      {navCollapsed ? (
        <button
          type="button"
          className="manager-nav-expand"
          aria-label="사이드바 펼치기"
          onClick={toggleNavCollapsed}
        >
          <PanelLeftOpen aria-hidden="true" />
        </button>
      ) : null}
      <dialog
        ref={mobileDialogRef}
        id="manager-mobile-nav-dialog"
        className="manager-mobile-nav-dialog"
        aria-label="관리자 전체 메뉴"
        onClick={closeMobileNavigationOnBackdrop}
        onClose={() => setMobileOpen(false)}
      >
        <Suspense fallback={null}><ManagerSidebar onNavigate={closeMobileNavigation} showCloseButton /></Suspense>
      </dialog>
      {!showAssistantRail && !fullAssistant && !hideAssistantLauncher ? (
        <ManagerAssistantLauncher
          managerName={managerName}
          contextLabel={typeof title === "string" ? title : "현재 관리자 화면"}
        />
      ) : null}
    </>
  );
}
