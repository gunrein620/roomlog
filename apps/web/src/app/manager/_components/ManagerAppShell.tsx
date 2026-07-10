"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
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
  children: ReactNode;
}

export function ManagerAppShell({
  title,
  context,
  subnav,
  managerName,
  showAssistantRail = false,
  assistantBriefing = [],
  children,
}: ManagerAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const fullAssistant = pathname.startsWith("/manager/agent/realtime");

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
        nav={<ManagerSidebar />}
        subnav={subnav ?? <ManagerSectionNav />}
        headerActions={action}
        rightRail={rail}
      >
        {children}
      </ManagerShell>
      <dialog
        ref={mobileDialogRef}
        id="manager-mobile-nav-dialog"
        className="manager-mobile-nav-dialog"
        aria-label="관리자 전체 메뉴"
        onClick={closeMobileNavigationOnBackdrop}
        onClose={() => setMobileOpen(false)}
      >
        <ManagerSidebar onNavigate={closeMobileNavigation} showCloseButton />
      </dialog>
      {!showAssistantRail && !fullAssistant ? (
        <ManagerAssistantLauncher
          managerName={managerName}
          contextLabel={typeof title === "string" ? title : "현재 관리자 화면"}
        />
      ) : null}
    </>
  );
}
