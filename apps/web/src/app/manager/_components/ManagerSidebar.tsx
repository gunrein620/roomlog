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
import { resolveTicketDashboardView } from "../ticket/dash/00/ticket-dashboard-view";

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

// 마지막으로 열려 있던 상위 항목 — 모듈 스코프라 경로 이동(사이드바 리마운트)에도 유지된다.
// 청구·수납처럼 하위 탭이 각각 다른 경로면 클릭마다 리마운트되는데, 같은 섹션 안 이동에서
// 등장 애니메이션이 매번 재생되지 않도록 섹션이 실제로 바뀔 때만 애니메이션한다.
let lastActiveItemId: ManagerNavItemId | null = null;

export function ManagerSidebar({ onNavigate, showCloseButton = false, headerAction }: ManagerSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 쿼리 기반 하위 탭(예: 매물 관리 ?status=)도 활성 판정에 반영 — pathname만 쓰면
  // childMatches의 쿼리 비교가 항상 실패해 첫 자식으로 수렴한다(하이라이트 고정 버그).
  const search = searchParams.toString();
  const fullPath = search ? `${pathname}?${search}` : pathname;
  const state = getManagerNavState(fullPath);
  const currentHref = getManagerCurrentHref(fullPath);
  const ticketActive = state.activeItemId === "ticket";
  const messagingActive = state.activeItemId === "messaging";
  const [ticketExpanded, setTicketExpanded] = useState(ticketActive);
  const [messagingExpanded, setMessagingExpanded] = useState(messagingActive);
  const dashboardView = resolveTicketDashboardView({
    type: searchParams.get("type") ?? undefined,
    view: searchParams.get("view") ?? undefined,
  });
  const ticketView = dashboardView === "dashboard" ? "dashboard" : "management";
  // 같은 섹션 안에서 하위 탭만 옮기는 경우(리마운트 포함)는 등장 애니메이션을 건너뛴다.
  const skipOpenAnimation = state.activeItemId !== null && state.activeItemId === lastActiveItemId;

  useEffect(() => {
    lastActiveItemId = state.activeItemId;
  }, [state.activeItemId]);

  useEffect(() => {
    if (ticketActive) setTicketExpanded(true);
  }, [pathname, ticketActive]);

  useEffect(() => {
    if (messagingActive) setMessagingExpanded(true);
  }, [pathname, messagingActive]);

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
                        className={`manager-sidebar__children-wrap${showChildren ? " is-open" : ""}${active && skipOpenAnimation ? " manager-sidebar__children-wrap--settled" : ""}`}
                        inert={!showChildren}
                      >
                        <div className="manager-sidebar__children">
                        {item.children.map((child) => {
                          const childActive = child.ticketView
                            // ticketView 매칭은 민원·하자 화면일 때만 — 다른 화면에서 '민원 대시보드'가
                            // 기본 view 값과 우연히 일치해 하이라이트되는 것을 막는다.
                            ? active && child.ticketView === ticketView
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
