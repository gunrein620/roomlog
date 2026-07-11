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
  const [ticketExpanded, setTicketExpanded] = useState(ticketActive);
  const ticketTypeFilter = searchParams.get("type") === "complaint"
    ? "complaint"
    : searchParams.get("type") === "defect"
      ? "defect"
      : "all";

  useEffect(() => {
    if (ticketActive) setTicketExpanded(true);
  }, [pathname, ticketActive]);

  return (
    <div className="manager-sidebar">
      <header className="manager-sidebar__header">
        <div className="manager-sidebar__brand">
          <Link href="/manager/home/00" onClick={onNavigate}>
            <Building2 aria-hidden="true" />
            <span>ROOMLOG</span>
          </Link>
          <span>관리자 워크스페이스</span>
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
        ) : (
          headerAction ?? null
        )}
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
                const showChildren = active && (!isTicket || ticketExpanded);

                return (
                  <div key={item.id} className="manager-sidebar__item">
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
                      {isTicket ? (
                        <button
                          type="button"
                          className="manager-sidebar__ticket-toggle"
                          aria-expanded={ticketExpanded}
                          aria-controls="manager-ticket-subnav"
                          aria-label={ticketExpanded ? "민원·하자 메뉴 접기" : "민원·하자 메뉴 펼치기"}
                          data-expanded={ticketExpanded}
                          onClick={() => setTicketExpanded((expanded) => !expanded)}
                        >
                          <ChevronDown aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    {showChildren ? (
                      <div
                        id={isTicket ? "manager-ticket-subnav" : undefined}
                        className="manager-sidebar__children"
                      >
                        {item.children.map((child) => {
                          const childActive = child.typeFilter
                            ? child.typeFilter === ticketTypeFilter
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
