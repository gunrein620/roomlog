"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Building2,
  ContactRound,
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
import {
  MANAGER_NAV_GROUPS,
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
}

export function ManagerSidebar({ onNavigate, showCloseButton = false }: ManagerSidebarProps) {
  const state = getManagerNavState(usePathname());

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
        ) : null}
      </header>

      <nav aria-label="관리자 전체 메뉴" className="manager-sidebar__nav">
        {MANAGER_NAV_GROUPS.map((group) => (
          <section key={group.label} className="manager-sidebar__group">
            <p className="manager-sidebar__group-label">{group.label}</p>
            <div className="manager-sidebar__items">
              {group.items.map((item) => {
                const active = state.activeItemId === item.id;
                const Icon = MANAGER_NAV_ICONS[item.icon];

                return (
                  <div key={item.id} className="manager-sidebar__item">
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`manager-sidebar__link${active ? " is-active" : ""}`}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                    {active ? (
                      <div className="manager-sidebar__children">
                        {item.children.map((child) => {
                          const childActive = state.activeChildHref === child.href;
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
