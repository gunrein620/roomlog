"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bot,
  Building2,
  ChevronDown,
  ContactRound,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Receipt,
  Settings,
  WalletCards,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  MANAGER_NAV_GROUPS,
  getManagerCurrentHref,
  getManagerNavState,
  type ManagerNavItemId,
} from "@/lib/manager-navigation";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";
import { resolveTicketDashboardView } from "../ticket/dash/00/ticket-dashboard-view";

// href에서 해시(#report 등)만 뽑는다 — 해시 없으면 빈 문자열(자산현황).
function hashOf(href: string): string {
  const index = href.indexOf("#");
  return index >= 0 ? href.slice(index) : "";
}

const MANAGER_NAV_ICONS: Record<ManagerNavItemId, LucideIcon> = {
  dashboard: LayoutDashboard,
  listing: Building2,
  contract: FileText,
  billing: WalletCards,
  cost: Receipt,
  ticket: Wrench,
  messaging: MessageSquare,
  moveout: LogOut,
  vendor: ContactRound,
  report: BarChart3,
  assistant: Bot,
  settings: Settings,
};

export interface ManagerSidebarProps {
  onNavigate?: () => void;
  showCloseButton?: boolean;
  /** 사이드바 우측 상단 액션 슬롯 (예: 데스크톱 접기 토글) — 모바일 닫기 버튼과 같은 자리. */
  headerAction?: ReactNode;
}

export function ManagerSidebar({ onNavigate, showCloseButton = false, headerAction }: ManagerSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = getManagerNavState(pathname);
  const currentHref = getManagerCurrentHref(pathname);
  const ticketActive = state.activeItemId === "ticket";
  const messagingActive = state.activeItemId === "messaging";
  const [ticketExpanded, setTicketExpanded] = useState(ticketActive);
  const [messagingExpanded, setMessagingExpanded] = useState(messagingActive);
  const dashboardView = resolveTicketDashboardView({
    type: searchParams.get("type") ?? undefined,
    view: searchParams.get("view") ?? undefined,
  });
  const ticketView = dashboardView === "dashboard" ? "dashboard" : "management";

  useEffect(() => {
    if (ticketActive) setTicketExpanded(true);
  }, [pathname, ticketActive]);

  useEffect(() => {
    if (messagingActive) setMessagingExpanded(true);
  }, [pathname, messagingActive]);

  // 통합 대시보드(home/00)에서만: 스크롤 위치로 해시 섹션(#report·#buildings·#register)을
  // 추적해 하위 탭 활성 표시를 동기화한다. 해시는 usePathname에 안 잡혀 클라이언트에서 직접 본다.
  const [activeHash, setActiveHash] = useState("");
  useEffect(() => {
    if (pathname !== MHOME_ROUTES["M-HOME-00"]) {
      setActiveHash("");
      return;
    }
    const ids = ["report", "buildings", "register"];
    let raf = 0;
    const compute = () => {
      raf = 0;
      // 뷰포트 상단에서 이 지점(160px)을 지난 마지막 섹션이 현재 섹션 — 지나기 전엔 자산현황.
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 160) current = `#${id}`;
      }
      setActiveHash(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <div className="manager-sidebar">
      <header className="manager-sidebar__header">
        <div className="manager-sidebar__lead">
          {!showCloseButton ? headerAction ?? null : null}
          <div className="manager-sidebar__brand">
            <Link href="/" onClick={onNavigate} className="manager-sidebar__brand-logo">
              <span className="manager-sidebar__brand-icon" aria-hidden="true">
                <svg viewBox="0 0 140 68" fill="none">
                  <path
                    d="M18 58 L70 18 L122 58"
                    stroke="currentColor"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="61" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="71" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="61" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="71" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
                </svg>
              </span>
              <span className="manager-sidebar__brand-name">
                집우집주<em>WOOZU</em>
              </span>
            </Link>
          </div>
        </div>
        {showCloseButton ? (
          <button
            type="button"
            className="manager-sidebar__close"
            aria-label="관리자 메뉴 닫기"
            onClick={onNavigate}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <nav aria-label="관리자 전체 메뉴" className="manager-sidebar__nav">
        {MANAGER_NAV_GROUPS.map((group) => (
          <section key={group.label} className="manager-sidebar__group">
            <p className="manager-sidebar__group-label">{group.label}</p>
            <div className="manager-sidebar__items">
              {group.items.map((item) => {
                const active = state.activeItemId === item.id;
                // 통합 대시보드 홈에서는 하위 탭 활성 판정을 스크롤 해시로 대체(자산현황=해시 없음).
                const isDashboardHome = item.id === "dashboard" && pathname === item.href;
                const parentCurrent = currentHref === item.href && state.activeChildHref === null;
                const Icon = MANAGER_NAV_ICONS[item.icon];
                const isTicket = item.id === "ticket";
                const isMessaging = item.id === "messaging";
                const isCollapsible = isTicket || isMessaging;
                const expanded = isTicket ? ticketExpanded : messagingExpanded;
                const subnavId = isTicket ? "manager-ticket-subnav" : "manager-messaging-subnav";
                const setExpanded = isTicket ? setTicketExpanded : setMessagingExpanded;
                const showChildren = isCollapsible ? expanded : active;

                return (
                  <div key={item.id} className="manager-sidebar__item">
                    {isCollapsible ? (
                      <button
                        type="button"
                        className={`manager-sidebar__parent-toggle${active ? " is-active" : ""}`}
                        aria-expanded={expanded}
                        aria-controls={subnavId}
                        aria-label={`${item.label} 메뉴 ${expanded ? "접기" : "펼치기"}`}
                        data-expanded={expanded}
                        onClick={() => setExpanded((current) => !current)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                        <ChevronDown aria-hidden="true" />
                      </button>
                    ) : (
                      <div className={`manager-sidebar__link-row${active ? " is-active" : ""}`}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={parentCurrent ? "page" : undefined}
                          className={`manager-sidebar__link${active ? " is-active" : ""}`}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                          {item.external ? (
                            <span className="manager-sidebar__external">
                              <ExternalLink aria-hidden="true" />
                              <span className="manager-sidebar__sr-only">관리자 워크스페이스 밖으로 이동</span>
                            </span>
                          ) : null}
                        </Link>
                      </div>
                    )}
                    {item.children.length > 0 ? (
                      // 항상 렌더하고 grid-rows 트랜지션으로 높이를 접었다 편다 —
                      // 조건부 마운트는 트랜지션이 불가능해 탭 전환이 뚝뚝 끊긴다.
                      <div
                        id={isCollapsible ? subnavId : undefined}
                        className={`manager-sidebar__children-wrap${showChildren ? " is-open" : ""}`}
                        inert={!showChildren}
                      >
                        <div className="manager-sidebar__children">
                        {item.children.map((child) => {
                          const childActive = child.ticketView
                            ? child.ticketView === ticketView
                            : isDashboardHome
                              ? hashOf(child.href) === activeHash
                              : child.active ?? currentHref === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={`manager-sidebar__child${childActive ? " is-active" : ""}`}
                            >
                              <span>{child.label}</span>
                              {child.demo ? <span className="manager-sidebar__demo">데모</span> : null}
                            </Link>
                          );
                        })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </div>
  );
}
